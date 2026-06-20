"""GIAS schools register -> schools + school_ofsted (overall grade).

Source: DfE Get Information About Schools, daily all-establishments CSV:
  https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata<YYYYMMDD>.csv
(GET works; HEAD 500s. Today's file may 404 until generated, so we try recent dates.)
GIAS ships Easting/Northing + postcode but no lat/lng — we resolve lat/lng via postcodes.io bulk.

    python -m pipelines.run gias_schools                 # download latest
    python -m pipelines.run gias_schools /path/file.csv  # use a local CSV
"""
from __future__ import annotations

import csv
import datetime as dt

import requests

from pipelines.common import UA, geocode_bulk
from pipelines.db import upsert

BASE = "https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata{stamp}.csv"


def run(conn, args: list[str]) -> int:
    lines = _read_csv(args[0]) if args else _read_csv(_latest_url())
    reader = csv.DictReader(lines)

    raw: list[dict] = []
    postcodes: set[str] = set()
    for row in reader:
        if (row.get("EstablishmentStatus (name)") or "").strip().lower().startswith("closed"):
            continue
        if not _int(row.get("URN")):
            continue
        pc = (row.get("Postcode") or "").strip()
        if pc:
            postcodes.add(pc)
        raw.append(row)

    coords = geocode_bulk(sorted(postcodes)) if postcodes else {}

    schools, ofsted = [], []
    for row in raw:
        urn = _int(row["URN"])
        pc = (row.get("Postcode") or "").strip()
        lat, lng = coords.get(pc, (None, None))
        schools.append((
            urn,
            (row.get("EstablishmentName") or "").strip(),
            row.get("TypeOfEstablishment (name)") or None,
            row.get("EstablishmentTypeGroup (name)") or None,
            row.get("PhaseOfEducation (name)") or None,
            row.get("EstablishmentStatus (name)") or None,
            row.get("Gender (name)") or None,
            row.get("ReligiousCharacter (name)") or None,
            _int(row.get("StatutoryLowAge")),
            _int(row.get("StatutoryHighAge")),
            (row.get("OfficialSixthForm (name)") or "").lower().startswith("has"),
            _int(row.get("SchoolCapacity")),
            _int(row.get("NumberOfPupils")),
            row.get("LA (code)") or None,
            row.get("LA (name)") or None,
            row.get("Street") or None,
            row.get("Town") or None,
            pc or None,
            lat, lng,
            row.get("UKPRN") or None,
        ))
        grade = (row.get("OfstedRating (name)") or "").strip()
        if grade:
            ofsted.append((urn, grade, _date(row.get("OfstedLastInsp"))))

    n = upsert(
        conn, "schools",
        ["urn", "name", "establishment_type", "establishment_group", "phase", "status", "gender",
         "religious_character", "age_low", "age_high", "has_sixth_form", "capacity",
         "number_on_roll", "la_code", "la_name", "street", "town", "postcode", "lat", "lng", "ukprn"],
        schools, conflict=["urn"],
    )
    upsert(conn, "school_ofsted", ["urn", "overall_grade", "inspection_date"], ofsted,
           conflict=["urn"], update=["overall_grade", "inspection_date"])
    return n


def _latest_url() -> str:
    today = dt.date.today()
    for i in range(6):
        url = BASE.format(stamp=(today - dt.timedelta(days=i)).strftime("%Y%m%d"))
        r = requests.get(url, headers=UA, stream=True, timeout=60)
        ok = r.status_code == 200
        r.close()
        if ok:
            return url
    raise RuntimeError("No recent GIAS CSV available; download manually and pass the file path.")


def _read_csv(src: str) -> list[str]:
    # GIAS is Windows-1252 / latin-1 encoded.
    if src.startswith("http"):
        resp = requests.get(src, headers=UA, timeout=300)
        resp.raise_for_status()
        resp.encoding = "latin-1"
        return resp.text.splitlines()
    with open(src, encoding="latin-1") as f:
        return f.read().splitlines()


def _int(v):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def _date(v):
    v = (v or "").strip()
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return dt.datetime.strptime(v, fmt).date()
        except ValueError:
            continue
    return None
