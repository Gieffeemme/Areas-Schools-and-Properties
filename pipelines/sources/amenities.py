"""Amenities -> amenities.

Source: OpenStreetMap via Overpass API. Categories: gp, hospital, supermarket, park, gym,
station, bus_stop, restaurant, pub. Overpass needs a User-Agent (406 without one).
For MVP the app can query Overpass live per search; this pipeline pre-caches by region/bbox.
"""
from __future__ import annotations


def run(conn, args: list[str]) -> int:
    raise NotImplementedError(
        "amenities: run Overpass queries per category over a bbox/region, upsert into amenities "
        "(osm_type, osm_id, category, name, lat, lng). geom is generated from lat/lng."
    )
