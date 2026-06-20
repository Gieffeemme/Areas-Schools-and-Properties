"""Exam results -> school_ks2 / school_ks4 / school_ks5.

Source: DfE Explore Education Statistics (KS2, KS4 Progress 8 / Attainment 8 / EBacc, KS5).
  https://explore-education-statistics.service.gov.uk/  (bulk CSV downloads per release)
Join key: URN. Load 3 most recent years for trend lines.
"""
from __future__ import annotations


def run(conn, args: list[str]) -> int:
    raise NotImplementedError(
        "dfe_results: pull the DfE EES KS2/KS4/KS5 release CSVs, filter to mainstream schools, "
        "upsert per (urn, year) into school_ks2 / school_ks4 / school_ks5. "
        "Capture disadvantaged Progress 8 for the deprivation-contextualised view."
    )
