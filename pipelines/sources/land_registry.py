"""HM Land Registry Price Paid -> price_paid.

Modes:
  python -m pipelines.run land_registry --postcode "SW11 6QT"   # incremental, geocodes for geom
  python -m pipelines.run land_registry --csv pp-2024.csv       # bulk CSV (headerless)
  python -m pipelines.run land_registry                         # bulk monthly update file

Bulk Price Paid CSV is headerless with a fixed column order:
  0 TID, 1 price, 2 date, 3 postcode, 4 type(D/S/T/F/O), 5 new(Y/N), 6 duration(F/L),
  7 PAON, 8 SAON, 9 street, 10 locality, 11 town, 12 district, 13 county, 14 PPD cat, 15 status
"""
from __future__ import annotations

import csv
import datetime as dt

import requests

from pipelines.common import UA, geocode_bulk
from pipelines.db import upsert

LD = "http://landregistry.data.gov.uk/data/ppi/transaction-record.json"
MONTHLY = (
    "http://prod.publicdata.landregistry.gov.uk.s3-website-eu-west-1.amazonaws.com/"
    "pp-monthly-update-new-version.csv"
)
TYPE = {"D": "detached", "S": "semi-detached", "T": "terraced", "F": "flat", "O": "other"}
COLS = ["transaction_id", "price", "date", "postcode", "paon", "saon", "street", "town",
        "district", "county", "property_type", "new_build", "tenure", "lat", "lng"]


def run(conn, args: list[str]) -> int:
    if args and args[0] == "--postcode":
        return _by_postcode(conn, args[1])
    url = args[1] if len(args) >= 2 and args[0] == "--csv" else MONTHLY
    return _bulk_csv(conn, url)


def _by_postcode(conn, postcode: str) -> int:
    data = requests.get(
        LD,
        params={"propertyAddress.postcode": postcode, "_pageSize": 200, "_sort": "-transactionDate"},
        headers={**UA, "Accept": "application/json"}, timeout=60,
    ).json()
    items = (data.get("result") or {}).get("items") or []
    geo = geocode_bulk([postcode]).get(postcode)
    lat, lng = geo if geo else (None, None)

    rows = []
    for it in items:
        addr = it.get("propertyAddress") or {}
        price = _int(it.get("pricePaid"))
        tid = it.get("transactionId") or _slug(it.get("_about"))
        if not (tid and price):
            continue
        rows.append((
            tid, price, _rfc_date(it.get("transactionDate")), addr.get("postcode"),
            addr.get("paon"), addr.get("saon"), addr.get("street"), addr.get("town"),
            addr.get("district"), addr.get("county"), _slug(it.get("propertyType")),
            None, _slug(it.get("estateType")), lat, lng,
        ))
    return upsert(conn, "price_paid", COLS, rows, conflict=["transaction_id"])


def _bulk_csv(conn, url: str) -> int:
    if url.startswith("http"):
        r = requests.get(url, headers=UA, stream=True, timeout=600)
        r.raise_for_status()
        src = r.iter_lines(decode_unicode=True)
    else:
        src = open(url, encoding="utf-8")
    reader = csv.reader(src)

    rows, total = [], 0
    for c in reader:
        if len(c) < 16:
            continue
        rows.append((
            c[0].strip("{}"), _int(c[1]), (c[2] or "")[:10] or None, c[3] or None,
            c[7] or None, c[8] or None, c[9] or None, c[11] or None, c[12] or None,
            c[13] or None, TYPE.get(c[4], "other"), c[5] == "Y",
            "freehold" if c[6] == "F" else "leasehold" if c[6] == "L" else None, None, None,
        ))
        if len(rows) >= 5000:
            total += upsert(conn, "price_paid", COLS, rows, conflict=["transaction_id"])
            rows = []
    total += upsert(conn, "price_paid", COLS, rows, conflict=["transaction_id"])
    return total


def _int(v):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def _slug(v):
    if isinstance(v, dict):
        v = v.get("_about") or ""
    if not isinstance(v, str):
        return None
    return v.rstrip("/").split("/")[-1].split("#")[-1].replace("-", " ") or None


def _rfc_date(v):
    v = (v or "").strip()
    for fmt in ("%a, %d %b %Y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(v, fmt).date()
        except ValueError:
            continue
    return None
