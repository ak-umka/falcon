"""Картинки для ролика: Pixabay по запросам из сценария. Пусто — монтаж сделает тёмный фирменный фон."""
import hashlib
from pathlib import Path

import httpx

API = "https://pixabay.com/api/"


def find_images(key: str | None, queries: list[str], count: int, cache: Path) -> list[Path]:
    if not key:
        return []
    cache.mkdir(parents=True, exist_ok=True)
    urls: list[str] = []
    with httpx.Client(timeout=30) as client:
        for query in queries:
            for orientation in ("vertical", "all"):
                resp = client.get(API, params={"key": key, "q": query[:100], "image_type": "photo", "orientation": orientation,
                                               "safesearch": "true", "per_page": 20, "order": "popular"})
                resp.raise_for_status()
                for hit in resp.json().get("hits", []):
                    if hit["largeImageURL"] not in urls:
                        urls.append(hit["largeImageURL"])
                if len(urls) >= count:
                    break
            if len(urls) >= count:
                break
        paths = []
        for url in urls[:count]:
            path = cache / (hashlib.sha1(url.encode()).hexdigest()[:16] + ".jpg")
            if not path.exists():
                resp = client.get(url)
                resp.raise_for_status()
                path.write_bytes(resp.content)
            paths.append(path)
    return paths
