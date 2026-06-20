"""Run AreaIQ ETL pipelines.

    python -m pipelines.run <source> [args...]
    python -m pipelines.run all
    python -m pipelines.run --list

Each source module under pipelines/sources/ exposes ``run(conn, args) -> int`` (rows loaded).
"""
from __future__ import annotations

import importlib
import sys

from pipelines.db import get_conn, record_run

SOURCES = [
    # implemented
    "gias_schools",
    "land_registry",
    "imd",
    "crime_benchmark",
    # scaffolded (raise NotImplementedError with source + target table)
    "ofsted_mi",
    "dfe_results",
    "parentview",
    "destinations",
    "epc",
    "flood",
    "amenities",
    "broadband",
]


def main(argv: list[str]) -> int:
    if not argv or argv[0] in ("-h", "--help", "--list"):
        print("Usage: python -m pipelines.run <source|all> [args]\n\nSources:\n  " + "\n  ".join(SOURCES))
        return 0

    name = argv[0]
    if name == "all":
        targets = SOURCES
    elif name in SOURCES:
        targets = [name]
    else:
        print(f"Unknown source '{name}'. Run with --list.")
        return 2

    conn = get_conn()
    rc = 0
    for t in targets:
        mod = importlib.import_module(f"pipelines.sources.{t}")
        try:
            n = mod.run(conn, argv[1:])
            record_run(conn, t, "success", n or 0)
            print(f"[{t}] ok ({n} rows)")
        except NotImplementedError as e:
            print(f"[{t}] not implemented yet — {e}")
        except Exception as e:  # noqa: BLE001
            record_run(conn, t, "failed", 0, str(e))
            print(f"[{t}] FAILED: {e}")
            rc = 1
    conn.close()
    return rc


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
