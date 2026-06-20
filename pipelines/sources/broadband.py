"""Broadband & mobile coverage -> (postcodes columns / new table).

Source: Ofcom Connected Nations fixed-broadband + mobile coverage data (CSV by postcode).
  https://www.ofcom.org.uk/research-and-data/multi-sector-research/infrastructure-research
Add columns to `postcodes` (e.g. superfast_pct, fullfibre_pct, median_download_mbps) or a
dedicated `broadband` table keyed by postcode, then load the Ofcom CSV.
"""
from __future__ import annotations


def run(conn, args: list[str]) -> int:
    raise NotImplementedError(
        "broadband: add a broadband table (or postcodes columns) in a follow-up migration, then "
        "load the Ofcom Connected Nations CSV keyed by postcode."
    )
