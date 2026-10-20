"""[8] Графика поверх видео: бренд, заголовок, источники и субтитры с подсветкой слова.

FFmpeg на машине собран без текстовых фильтров, поэтому каждый кадр графики
рисуем в Pillow как прозрачный PNG, а FFmpeg только накладывает их по таймингам.
"""
import os
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .tts import Word

FONT_CANDIDATES = [
    os.getenv("FONT_PATH", ""),
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]

RED = (225, 29, 42, 255)
YELLOW = (255, 212, 0, 255)
WHITE = (255, 255, 255, 255)
MUTED = (220, 220, 220, 255)
MARGIN = 60


@lru_cache
def font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if path and Path(path).exists():
            return ImageFont.truetype(path, size)
    raise RuntimeError("Не найден шрифт: задайте FONT_PATH в .env")


def _wrap(draw: ImageDraw.ImageDraw, words: list[str], fnt, max_width: int) -> list[list[int]]:
    """Разбивает слова на строки; возвращает индексы слов в каждой строке."""
    lines, current = [], []
    for i, w in enumerate(words):
        trial = " ".join(words[j] for j in current + [i])
        if current and draw.textlength(trial, font=fnt) > max_width:
            lines.append(current)
            current = []
        current.append(i)
    if current:
        lines.append(current)
    return lines


def _gradient(width: int, height: int, top: bool) -> Image.Image:
    grad = Image.new("L", (1, height))
    for y in range(height):
        t = (1 - y / height) if top else (y / height)
        grad.putpixel((0, y), int(215 * t ** 1.4))
    alpha = grad.resize((width, height))
    layer = Image.new("RGBA", (width, height), (0, 0, 0, 255))
    layer.putalpha(alpha)
    return layer


def base_layer(w: int, h: int, brand: str, section: str, headline: str, sources: list[str],
               sources_label: str = "Sources") -> Image.Image:
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    img.alpha_composite(_gradient(w, 760, top=True), (0, 0))
    img.alpha_composite(_gradient(w, 900, top=False), (0, h - 900))
    draw = ImageDraw.Draw(img)

    # Плашка бренда
    f_brand = font(40)
    pad_x, pad_y, y = 26, 14, 90
    bw = draw.textlength(brand, font=f_brand)
    draw.rounded_rectangle((MARGIN, y, MARGIN + bw + 2 * pad_x, y + 40 + 2 * pad_y), 10, fill=RED)
    draw.text((MARGIN + pad_x, y + pad_y - 2), brand, font=f_brand, fill=WHITE)
    meta = f"{section}  ·  {datetime.now():%d.%m.%Y}"
    draw.text((MARGIN + bw + 2 * pad_x + 24, y + pad_y - 2), meta, font=font(36), fill=MUTED)

    # Заголовок с красной полосой слева
    f_head = font(64)
    words = headline.split()
    lines = _wrap(draw, words, f_head, w - 2 * MARGIN - 30)[:4]
    y = 210
    top = y
    for line in lines:
        draw.text((MARGIN + 30, y), " ".join(words[i] for i in line), font=f_head, fill=WHITE)
        y += 78
    draw.rectangle((MARGIN, top + 6, MARGIN + 10, y - 10), fill=RED)

    # Источники — внизу, видно что новость проверена
    src = f"{sources_label}: " + " · ".join(sources[:4]) + (f"  +{len(sources) - 4}" if len(sources) > 4 else "")
    draw.text((MARGIN, h - 130), src, font=font(34), fill=MUTED)
    return img


def _chunks(words: list[Word], max_words=4, max_chars=26) -> list[list[Word]]:
    chunks, current = [], []
    for word in words:
        text = " ".join(x.text for x in current + [word])
        if current and (len(current) >= max_words or len(text) > max_chars):
            chunks.append(current)
            current = []
        current.append(word)
    if current:
        chunks.append(current)
    return chunks


def caption_frame(base: Image.Image, chunk: list[Word], active: int) -> Image.Image:
    img = base.copy()
    draw = ImageDraw.Draw(img)
    f_sub = font(84)
    texts = [x.text.upper() for x in chunk]
    lines = _wrap(draw, texts, f_sub, img.width - 2 * MARGIN)
    y = 1300
    for line in lines:
        line_text = " ".join(texts[i] for i in line)
        x = (img.width - draw.textlength(line_text, font=f_sub)) / 2
        for i in line:
            draw.text((x, y), texts[i], font=f_sub, fill=YELLOW if i == active else WHITE,
                      stroke_width=6, stroke_fill=(0, 0, 0, 255))
            x += draw.textlength(texts[i] + " ", font=f_sub)
        y += 104
    return img


def render_overlays(words: list[Word], duration: float, base: Image.Image, out_dir: Path) -> Path:
    """Рисует кадры графики и concat-список для FFmpeg с длительностью каждого кадра."""
    out_dir.mkdir(parents=True, exist_ok=True)
    entries: list[tuple[Path, float]] = []

    base_path = out_dir / "base.png"
    base.save(base_path)
    if words[0].start > 0.05:
        entries.append((base_path, words[0].start))

    n = 0  # сквозной индекс слова: порядок в чанках совпадает с words
    for chunk in _chunks(words):
        for i, word in enumerate(chunk):
            nxt = words[n + 1].start if n + 1 < len(words) else duration
            path = out_dir / f"cap_{n:04d}.png"
            caption_frame(base, chunk, i).save(path, compress_level=1)
            entries.append((path, max(nxt - word.start, 1 / 30)))
            n += 1

    listing = out_dir / "overlays.txt"
    with open(listing, "w") as f:
        for path, dur in entries:
            f.write(f"file '{path.name}'\nduration {dur:.3f}\n")
        f.write(f"file '{entries[-1][0].name}'\n")  # concat требует повторить последний кадр
    return listing
