"""Ofsted sub-grades -> school_ofsted (quality_of_education, leadership, behaviour, ...).

Source: Ofsted "Management information - state-funded schools latest inspections" (ODS/CSV):
  https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes
Join key: URN. GIAS provides the overall grade; this fills sub-grades + report URL.
"""
from __future__ import annotations


def run(conn, args: list[str]) -> int:
    raise NotImplementedError(
        "ofsted_mi: download the Ofsted MI workbook, convert to CSV, map sub-grade columns by "
        "URN and UPDATE school_ofsted (quality_of_education, leadership_management, "
        "behaviour_attitudes, personal_development, early_years, sixth_form, report_url)."
    )
