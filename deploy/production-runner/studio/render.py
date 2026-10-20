"""[8] Монтаж: фоны с плавным зумом + графика + озвучка → MP4 9:16."""
import json
import math
import subprocess
from pathlib import Path

from PIL import Image

ZOOM = 1.12  # насколько приближается кадр за сегмент


def _run(args: list[str]) -> None:
    proc = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
                          capture_output=True, text=True)
    if proc.returncode:
        raise RuntimeError(f"FFmpeg: {proc.stderr.strip()[-800:]}")


def media_duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(json.loads(out)["format"]["duration"])


def _ken_burns(img: Path, out: Path, frames: int, w: int, h: int, fps: int, zoom_in: bool, enc: list[str]) -> None:
    """Плавный зум к центру (эффект Кена Бёрнса).

    zoompan и scale с eval=frame в FFmpeg округляют положение до целых пикселей — картинка дёргается.
    Здесь каждый кадр — аффинное преобразование Pillow с субпиксельной точностью, FFmpeg только кодирует.
    """
    src = Image.open(img).convert("RGB")
    cover = max(w * ZOOM / src.width, h * ZOOM / src.height)  # запас под зум без пустых краёв
    base = src.resize((round(src.width * cover), round(src.height * cover)), Image.LANCZOS)
    cx, cy = base.width / 2, base.height / 2
    proc = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                             "-s", f"{w}x{h}", "-r", str(fps), "-i", "-", *enc, str(out)], stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for n in range(frames):
            t = n / max(frames - 1, 1)
            ease = 0.5 - 0.5 * math.cos(math.pi * t)  # мягкий старт и остановка
            z = 1 + (ZOOM - 1) * (ease if zoom_in else 1 - ease)
            a = ZOOM / z  # пикселей base на пиксель кадра: окно шириной w·ZOOM/z вокруг центра
            frame = base.transform((w, h), Image.AFFINE, (a, 0, cx - a * w / 2, 0, a, cy - a * h / 2), resample=Image.BILINEAR)
            proc.stdin.write(frame.tobytes())
        proc.stdin.close()
        if proc.wait():
            raise RuntimeError(f"FFmpeg: {proc.stderr.read().decode()[-800:]}")
    finally:
        if proc.poll() is None:
            proc.kill()


def _background(images: list[Path], total: float, w: int, h: int, fps: int, work: Path) -> Path:
    bg = work / "background.mp4"
    enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(fps)]
    if not images:
        # Запасной вариант: тёмный фирменный фон, ролик выходит всегда.
        _run(["-f", "lavfi", "-i", f"color=c=0x101826:s={w}x{h}:r={fps}:d={total:.2f}", *enc, str(bg)])
        return bg

    seg_dur = total / len(images)
    frames = max(1, round(seg_dur * fps))
    parts = []
    for i, img in enumerate(images):
        part = work / f"seg_{i}.mp4"
        _ken_burns(Path(img), part, frames, w, h, fps, zoom_in=i % 2 == 0, enc=enc)
        parts.append(part)

    listing = work / "segments.txt"
    listing.write_text("".join(f"file '{p.name}'\n" for p in parts))
    _run(["-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(bg)])
    return bg


def compose(images: list[Path], overlays: Path, voice: Path, total: float,
            w: int, h: int, fps: int, work: Path, out: Path) -> Path:
    bg = _background(images, total, w, h, fps, work)
    out.parent.mkdir(parents=True, exist_ok=True)
    _run([
        "-i", str(bg),
        "-f", "concat", "-safe", "0", "-i", str(overlays),
        "-i", str(voice),
        "-filter_complex", f"[1:v]fps={fps},format=rgba[ov];[0:v][ov]overlay=0:0:format=auto,format=yuv420p[v]",
        "-map", "[v]", "-map", "2:a",
        "-c:v", "libx264", "-preset", "medium", "-crf", "21",
        "-c:a", "aac", "-b:a", "160k",
        "-t", f"{total:.2f}", "-movflags", "+faststart",
        str(out),
    ])
    return out
