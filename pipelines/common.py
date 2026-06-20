"""Shared HTTP / CSV helpers for the ETL pipelines."""
from __future__ import annotations

import csv
import time
from typing import Iterator

import requests

UA = {"User-Agent": "areaiq-etl/0.1 (UK area intelligence)"}


def get_json(url: str, params: dict | None = None, retries: int = 4, timeout: int = 30):
    """GET JSON with a User-Agent and 429 backoff (several sources rate-limit / 406 without one)."""
    for attempt in range(retries):
        r = requests.get(url, params=params, headers=UA, timeout=timeout)
        if r.status_code == 429:
            time.sleep(1.5 * (attempt + 1))
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"rate-limited after {retries} tries: {url}")


def stream_csv(url: str, encoding: str = "utf-8", timeout: int = 300) -> Iterator[dict]:
    """Stream a (possibly large) CSV URL as dict rows, without buffering the whole file."""
    with requests.get(url, headers=UA, stream=True, timeout=timeout) as r:
        r.raise_for_status()
        r.encoding = encoding
        reader = csv.DictReader(r.iter_lines(decode_unicode=True))
        for row in reader:
            yield row


def geocode_bulk(postcodes: list[str]) -> dict[str, tuple[float, float]]:
    """Resolve postcodes -> (lat, lng) via postcodes.io bulk endpoint (<=100 per call)."""
    out: dict[str, tuple[float, float]] = {}
    for i in range(0, len(postcodes), 100):
        chunk = [p for p in postcodes[i : i + 100] if p]
        if not chunk:
            continue
        resp = requests.post(
            "https://api.postcodes.io/postcodes",
            json={"postcodes": chunk},
            headers=UA,
            timeout=30,
        )
        resp.raise_for_status()
        for item in resp.json().get("result", []):
            res = item.get("result")
            if res:
                out[res["postcode"]] = (res["latitude"], res["longitude"])
                # also key by the query form (caller may use either)
                out[item["query"]] = (res["latitude"], res["longitude"])
    return out
