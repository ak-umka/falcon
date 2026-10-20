"""[8] Озвучка через Edge-TTS (бесплатно) с таймингом каждого слова для субтитров."""
import asyncio
import inspect
from dataclasses import dataclass
from pathlib import Path

import edge_tts


@dataclass
class Word:
    text: str
    start: float  # секунды
    end: float


async def _speak(text: str, voice: str, out: Path) -> list[Word]:
    kwargs = {"rate": "+5%"}
    # В edge-tts 7.x тайминги слов нужно запросить явно.
    if "boundary" in inspect.signature(edge_tts.Communicate.__init__).parameters:
        kwargs["boundary"] = "WordBoundary"
    communicate = edge_tts.Communicate(text, voice, **kwargs)
    words: list[Word] = []
    with open(out, "wb") as f:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 10_000_000
                words.append(Word(chunk["text"], start, start + chunk["duration"] / 10_000_000))
    return words


def synthesize(text: str, voice: str, out: Path, attempts: int = 3) -> list[Word]:
    # Edge-TTS иногда обрывает поток без ошибки — проверяем, что озвучен весь текст.
    expected = len(text.split())
    for attempt in range(1, attempts + 1):
        try:
            words = asyncio.run(_speak(text, voice, out))
        except Exception:
            if attempt == attempts:
                raise
            continue
        if words and len(words) >= 0.9 * expected:
            return words
    raise RuntimeError(f"Edge-TTS озвучил {len(words)} из {expected} слов после {attempts} попыток.")
