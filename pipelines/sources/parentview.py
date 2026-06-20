"""Ofsted Parent View -> school_parentview.

Source: https://parentview.ofsted.gov.uk/  (per-school % positive across 12 questions).
No bulk download — scrape/poll per URN (respect robots + rate limits) or use a licensed feed.
Store respondents count so the UI can weight low-N results.
"""
from __future__ import annotations


def run(conn, args: list[str]) -> int:
    raise NotImplementedError(
        "parentview: collect % positive (happy, safe, behaviour, bullying, SEND, recommend) "
        "and respondent count per URN; upsert into school_parentview. Weight low-N in the UI."
    )
