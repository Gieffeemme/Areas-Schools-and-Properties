"""EPC ratings -> epc.

Source: MHCLG EPC register API (free, requires registration for a token):
  https://epc.opendatacommunities.org/docs/api/domestic
Auth: set EPC_API_KEY (base64 'email:apikey'). Query by postcode; paginate.
"""
from __future__ import annotations

import os


def run(conn, args: list[str]) -> int:
    if not os.environ.get("EPC_API_KEY"):
        raise NotImplementedError(
            "epc: set EPC_API_KEY (register free at epc.opendatacommunities.org), then query "
            "/api/v1/domestic/search?postcode=... and upsert into epc by lmk-key. "
            "Geocode the postcode for geom."
        )
    raise NotImplementedError("epc: implement paginated postcode/area fetch + upsert into epc.")
