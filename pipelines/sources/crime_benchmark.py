"""National reference distributions -> benchmark_distributions.

Samples N random English postcodes (postcodes.io /random/postcodes), recording police.uk
~1-mile crime counts ('crime_1mi') and HM Land Registry per-LA average prices ('price_la_avg').
Python port of scripts/etl/build-benchmarks.mjs, writing to Postgres instead of JSON.

    N=200 python -m pipelines.run crime_benchmark
"""
from __future__ import annotations

import datetime as dt
import os
import time

import requests

from pipelines.common import UA, get_json
from pipelines.db import upsert


def run(conn, args: list[str]) -> int:
    n = int(os.environ.get("N") or (args[0] if args else 150))
    crime: list[int] = []
    las: set[str] = set()

    got = 0
    while got < n:
        try:
            x = get_json("https://api.postcodes.io/random/postcodes").get("result")
        except Exception:
            continue
        if not x or x.get("country") != "England":
            continue
        c = _police_count(x["latitude"], x["longitude"])
        if c is None:
            continue
        crime.append(c)
        if x.get("admin_district"):
            las.add(x["admin_district"])
        got += 1
        time.sleep(0.25)

    price: list[int] = []
    for la in las:
        try:
            a = _la_avg(la)
            if a:
                price.append(a)
        except Exception:
            pass
        time.sleep(0.12)

    crime.sort()
    price.sort()
    now = dt.datetime.now(dt.timezone.utc)
    rows = [
        ("crime_1mi", len(crime), crime, now),
        ("price_la_avg", len(price), price, now),
    ]
    return upsert(
        conn, "benchmark_distributions",
        ["metric", "sample_count", "samples", "generated_at"],
        rows, conflict=["metric"], update=["sample_count", "samples", "generated_at"],
    )


def _police_count(lat, lng):
    for attempt in range(4):
        r = requests.get(
            "https://data.police.uk/api/crimes-street/all-crime",
            params={"lat": lat, "lng": lng}, headers=UA, timeout=30,
        )
        if r.status_code == 429:
            time.sleep(1.5 * (attempt + 1))
            continue
        r.raise_for_status()
        d = r.json()
        return len(d) if isinstance(d, list) else 0
    return None


def _la_avg(district: str):
    d = get_json(
        "http://landregistry.data.gov.uk/data/ppi/transaction-record.json",
        params={"propertyAddress.district": district.upper(), "_pageSize": 100, "_sort": "-transactionDate"},
    )
    items = (d.get("result") or {}).get("items") or []
    prices = [int(it["pricePaid"]) for it in items if it.get("pricePaid")]
    return round(sum(prices) / len(prices)) if prices else None
