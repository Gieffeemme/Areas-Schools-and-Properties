"""Index of Multiple Deprivation by LSOA -> imd.

Source: MHCLG English Indices of Deprivation (CSV) — e.g. "File 7: all ranks, deciles and
scores". Column names vary by release, so we match them fuzzily.

    python -m pipelines.run imd --csv <url|path>
"""
from __future__ import annotations

import csv

import requests

from pipelines.common import UA
from pipelines.db import upsert


def run(conn, args: list[str]) -> int:
    if not args or args[0] != "--csv":
        raise NotImplementedError(
            "imd: pass --csv <url|path> to the MHCLG IMD 'all ranks/deciles/scores' file. "
            "Source: https://www.gov.uk/government/statistics/english-indices-of-deprivation-2019"
        )
    src = args[1]
    lines = _read(src)
    reader = csv.DictReader(lines)
    fields = reader.fieldnames or []

    lsoa = _find(fields, "lsoa code")
    rank = _find(fields, "index of multiple deprivation (imd) rank")
    decile = _find(fields, "index of multiple deprivation (imd) decile")
    inc = _find(fields, "income score")
    emp = _find(fields, "employment score")
    inc_d = _find(fields, "income decile")
    emp_d = _find(fields, "employment decile")

    rows = []
    for r in reader:
        code = (r.get(lsoa) or "").strip() if lsoa else ""
        if not code:
            continue
        rows.append((
            code, _int(r.get(rank)), _int(r.get(decile)),
            _num(r.get(inc)), _num(r.get(emp)), _int(r.get(inc_d)), _int(r.get(emp_d)),
        ))
    return upsert(
        conn, "imd",
        ["lsoa_code", "imd_rank", "imd_decile", "income_score", "employment_score",
         "income_decile", "employment_decile"],
        rows, conflict=["lsoa_code"],
    )


def _read(src: str) -> list[str]:
    if src.startswith("http"):
        resp = requests.get(src, headers=UA, timeout=300)
        resp.raise_for_status()
        return resp.text.splitlines()
    with open(src, encoding="utf-8-sig") as f:
        return f.read().splitlines()


def _find(fields: list[str], needle: str):
    needle = needle.lower()
    for f in fields:
        if needle in f.lower():
            return f
    return None


def _int(v):
    try:
        return int(float(str(v).replace(",", "").strip()))
    except (TypeError, ValueError):
        return None


def _num(v):
    try:
        return float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
