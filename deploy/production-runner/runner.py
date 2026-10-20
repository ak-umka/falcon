"""Runner Falcon News Studio.

Каждые 15 секунд:
  1. /api/internal/production — продвигает очередь HeyGen/Shotstack (как в v7);
  2. /api/internal/autopilot tick — радар новостей и автопилот (сервер сам ограничивает частоту);
  3. берёт задание дешёвого монтажа, делает MP4 (Edge-TTS + Pixabay + FFmpeg) и загружает в студию.
"""
import os
import shutil
import signal
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx

from studio.captions import base_layer, render_overlays
from studio.render import compose, media_duration
from studio.tts import synthesize
from studio.visuals import find_images

STUDIO_URL = os.getenv("STUDIO_URL", "").rstrip("/")
TOKEN = os.getenv("PRODUCTION_RUNNER_TOKEN", "")
PIXABAY = os.getenv("PIXABAY_API_KEY") or None
WORK = Path(os.getenv("RUNNER_WORKDIR", tempfile.gettempdir())) / "falcon-runner"

host = urlparse(STUDIO_URL).hostname or ""
if not TOKEN or not STUDIO_URL or (urlparse(STUDIO_URL).scheme != "https" and host not in ("127.0.0.1", "localhost")):
    sys.exit("Задайте HTTPS STUDIO_URL (http допустим только для localhost) и PRODUCTION_RUNNER_TOKEN.")

VOICES = {"ru": "ru-RU-DmitryNeural", "uz": "uz-UZ-SardorNeural", "kk": "kk-KZ-DauletNeural", "en": "en-US-AndrewNeural"}
LABELS = {"ru": ("МИР", "Источники"), "uz": ("DUNYO", "Manbalar"), "kk": ("ӘЛЕМ", "Дереккөздер"), "en": ("WORLD", "Sources")}
W, H, FPS, BRAND = 1080, 1920, 30, os.getenv("BRAND", "FALCON NEWS")

stopped = False
for sig in (signal.SIGINT, signal.SIGTERM):
    signal.signal(sig, lambda *_: globals().__setitem__("stopped", True))

client = httpx.Client(base_url=STUDIO_URL, headers={"Authorization": f"Bearer {TOKEN}"}, timeout=270, follow_redirects=False)


def log(msg: str) -> None:
    print(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {msg}", flush=True)


def call(path: str, body: dict) -> dict | None:
    try:
        resp = client.post(path, json=body)
    except httpx.HTTPError as e:
        log(f"{path}: нет ответа ({type(e).__name__})")
        return None
    if resp.status_code != 200:
        log(f"{path}: HTTP {resp.status_code} {resp.text[:200]}")
        return None
    return resp.json()


def render(task: dict) -> Path:
    lang = task["language"]
    work = WORK / task["id"]
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True)
    voice = work / "voice.mp3"
    words = synthesize(task["narration"], VOICES[lang], voice)
    total = media_duration(voice) + 0.6
    if task.get("photo"):
        # Фото редакции (например, спикер события) — фоном весь ролик, два плана с разным зумом.
        resp = client.post("/api/internal/autopilot", json={"action": "photo", "id": task["id"], "token": task["token"]})
        resp.raise_for_status()
        photo = work / "photo.jpg"
        photo.write_bytes(resp.content)
        images = [photo, photo]
    else:
        images = find_images(PIXABAY, task["visualQueries"], 4, WORK / "images")
    section, sources_label = LABELS[lang]
    section = task.get("section") or section
    base = base_layer(W, H, BRAND, section, task["headline"], task["sources"], sources_label)
    overlays = render_overlays(words, total, base, work / "overlays")
    return compose(images, overlays, voice, total, W, H, FPS, work, work / "video.mp4")


def render_one() -> bool:
    data = call("/api/internal/autopilot", {"action": "claim"})
    task = data and data.get("task")
    if not task:
        return False
    log(f"монтаж [{task['language']}] {task['headline']}")
    try:
        path = render(task)
    except Exception as e:  # монтаж локальный и бесплатный — ошибку отдаём в студию, без повторов
        log(f"монтаж не удался: {e}")
        call("/api/internal/autopilot", {"action": "fail", "id": task["id"], "token": task["token"], "error": str(e)[:500]})
        return True
    try:
        with open(path, "rb") as f:
            resp = client.post("/api/internal/autopilot", data={"id": task["id"], "token": task["token"]},
                               files={"file": ("video.mp4", f, "video/mp4")})
        log(f"загружено: HTTP {resp.status_code} {resp.text[:300]}")
    except httpx.HTTPError as e:
        log(f"загрузка не подтверждена ({type(e).__name__}); аренда истечёт, задание вернётся в очередь")
    finally:
        shutil.rmtree(WORK / task["id"], ignore_errors=True)
    return True


log(f"runner запущен: {STUDIO_URL}, Pixabay {'есть' if PIXABAY else 'нет — фирменный фон'}")
while not stopped:
    call("/api/internal/production", {})
    tick = call("/api/internal/autopilot", {"action": "tick"})
    if tick and (tick.get("drafted") or tick.get("errors")):
        log(f"автопилот: {tick}")
    while not stopped and render_one():
        pass
    for _ in range(15):
        if stopped:
            break
        time.sleep(1)
log("runner остановлен")
