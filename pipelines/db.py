"""Database helpers for the AreaIQ ETL pipelines (Supabase / Postgres + PostGIS)."""
from __future__ import annotations

import os

import psycopg2
from psycopg2.extras import execute_values


def get_dsn() -> str:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit(
            "DATABASE_URL is not set. Point it at your Supabase/Postgres (PostGIS) database, e.g.\n"
            "  export DATABASE_URL='postgresql://postgres:postgres@localhost:55432/areaiq'"
        )
    return dsn


def get_conn():
    return psycopg2.connect(get_dsn())


def upsert(
    conn,
    table: str,
    columns: list[str],
    rows: list[tuple],
    conflict: list[str],
    update: list[str] | None = None,
) -> int:
    """Batched ``INSERT ... ON CONFLICT DO UPDATE``. Returns the number of rows sent."""
    if not rows:
        return 0
    col_sql = ", ".join(columns)
    conflict_sql = ", ".join(conflict)
    if update is None:
        update = [c for c in columns if c not in conflict]
    if update:
        set_sql = ", ".join(f"{c} = EXCLUDED.{c}" for c in update)
        action = f"DO UPDATE SET {set_sql}"
    else:
        action = "DO NOTHING"
    sql = f"INSERT INTO {table} ({col_sql}) VALUES %s ON CONFLICT ({conflict_sql}) {action}"
    with conn.cursor() as cur:
        execute_values(cur, sql, rows, page_size=1000)
    conn.commit()
    return len(rows)


def record_run(conn, source: str, status: str, rows: int, message: str = "") -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO etl_runs (source, status, rows_loaded, message, started_at) "
            "VALUES (%s, %s, %s, %s, now())",
            (source, status, rows, message[:500]),
        )
    conn.commit()
