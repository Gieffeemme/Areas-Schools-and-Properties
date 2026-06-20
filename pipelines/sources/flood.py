"""Flood risk polygons -> flood_risk.

Source: Environment Agency Real Time / Flood Map for Planning (Risk of Flooding from Rivers
and Sea; Risk of Flooding from Surface Water).  https://environment.data.gov.uk/
Load polygons with risk band; insert as MultiPolygon (SRID 4326). geopandas/shapely help.
The app then flags risk via ST_Intersects(flood_risk.geom, point).
"""
from __future__ import annotations


def run(conn, args: list[str]) -> int:
    raise NotImplementedError(
        "flood: download EA flood-risk polygons (WFS/GeoJSON), reproject to 4326, insert into "
        "flood_risk(source, risk_band, geom). Consider geopandas + ST_GeomFromGeoJSON."
    )
