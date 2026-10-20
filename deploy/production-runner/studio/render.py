"""[8] Монтаж: фоны с плавным зумом + графика + озвучка → MP4 9:16."""
import json
import subprocess
from pathlib import Path


def _run(args: list[str]) -> None:
    proc = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args],
                          capture_output=True, text=True)
    if proc.returncode:
        raise RuntimeError(f"FFmpeg: {proc.stderr.strip()[-800:]}")


def media_duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(json.loads(out)["format"]["duration"])


def _background(images: list[Path], total: float, w: int, h: int, fps: int, work: Path) -> Path:
    bg = work / "background.mp4"
    enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(fps)]
    if not images:
        # Запасной вариант: тёмный фирменный фон, ролик выходит всегда.
        _run(["-f", "lavfi", "-i", f"color=c=0x101826:s={w}x{h}:r={fps}:d={total:.2f}", *enc, str(bg)])
        return bg

    seg_dur = total / len(images)
    frames = int(seg_dur * fps) + 1
    parts = []
    for i, img in enumerate(images):
        zoom = f"1+0.12*on/{frames}" if i % 2 == 0 else f"1.12-0.12*on/{frames}"
        vf = (f"scale={w * 2}:{h * 2}:force_original_aspect_ratio=increase,crop={w * 2}:{h * 2},"
              f"zoompan=z='{zoom}':d={frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}:fps={fps}")
        part = work / f"seg_{i}.mp4"
        _run(["-i", str(img), "-vf", vf, "-frames:v", str(frames), *enc, str(part)])
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
