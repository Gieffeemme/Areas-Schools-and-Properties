"""Pupil destinations -> school_destinations.

Source: DfE EES KS4 & KS5 destination measures (sustained education / apprenticeship /
employment / NEET / HE).  https://explore-education-statistics.service.gov.uk/
Join key: URN. key_stage in ('ks4','ks5'). Independent schools have thin coverage — flag it.
"""
from __future__ import annotations


def run(conn, args: list[str]) -> int:
    raise NotImplementedError(
        "destinations: load DfE EES destination-measures CSVs into school_destinations "
        "per (urn, year, key_stage)."
    )
