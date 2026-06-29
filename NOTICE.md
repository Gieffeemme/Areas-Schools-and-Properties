# Third-party data — sources, licences & attribution

Locale ("Areas, Schools and Properties") is built from free, publicly available UK data. Each dataset
is used under its open-data licence, with attribution. This NOTICE covers the **third-party data** only;
it does not license this repository's own source code.

The in-app version of this notice (with disclaimers) is at `/sources`.

## Sources & licences

| Data | Provider | Licence |
|------|----------|---------|
| Schools register & metadata (GIAS) | Department for Education | OGL v3.0 |
| Welsh schools register (address list of schools) | Welsh Government | OGL v3.0 |
| NI schools register (school level enrolment data) | Department of Education NI | OGL v3.0 |
| Scottish schools register (School Roll and Locations) | Scottish Government | OGL v3.0 |
| Ofsted ratings & Early Years report cards | Ofsted | OGL v3.0 |
| Exam & performance (KS2/4/5, destinations, census, workforce, finance) | Department for Education | OGL v3.0 |
| Parent View | Ofsted | OGL v3.0 |
| Street-level crime | police.uk / data.police.uk | OGL v3.0 |
| Sold prices (Price Paid Data) | HM Land Registry | OGL v3.0 |
| Deprivation, England (IoD 2019) | MHCLG | OGL v3.0 |
| Deprivation, Wales (WIMD 2025) | Welsh Government | OGL v3.0 |
| Deprivation, Scotland (SIMD 2020v2) | Scottish Government | OGL v3.0 |
| Deprivation, Northern Ireland (NIMDM 2017) | NISRA (via Open Data NI) | OGL v3.0 |
| Census 2021 demographics | Office for National Statistics (via Nomis) | OGL v3.0 |
| Council-tax bands (stock) & levels | Valuation Office Agency / MHCLG | OGL v3.0 |
| Broadband (Connected Nations) | Ofcom | OGL v3.0 |
| Environmental noise (strategic noise mapping) | Defra | OGL v3.0 |
| Flood risk & warnings | Environment Agency | OGL v3.0 |
| Energy performance certificates (EPC) | MHCLG (Get energy performance of buildings data) | EPB reuse terms |
| Planning applications | PlanIt (aggregates UK local-authority planning registers) | Third-party aggregator (see note) |
| Amenities, stations, EV charging & base maps | OpenStreetMap contributors | **ODbL** (data); tiles © CARTO / © Mapbox |
| Postcode & place geocoding | postcodes.io (ONS / OS Open Names / Royal Mail) | OGL v3.0 |

## Required attribution statements

- Contains public sector information licensed under the Open Government Licence v3.0
  (<https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/>).
- Contains HM Land Registry data © Crown copyright and database right 2026. This data is licensed under
  the Open Government Licence v3.0.
- © OpenStreetMap contributors. OpenStreetMap data is available under the Open Database Licence, ODbL
  (<https://opendatacommons.org/licenses/odbl/1-0/>). Map tiles © CARTO and © Mapbox.
- Contains OS data © Crown copyright and database right 2026; Royal Mail data © Royal Mail copyright and
  database right 2026; National Statistics data © Crown copyright and database right 2026 (via postcodes.io).
- Energy performance certificate data is used under the Energy Performance of Buildings reuse terms.

## Planning data (PlanIt)

Planning application data is provided by **PlanIt** (<https://www.planit.org.uk>), a third-party service
that aggregates UK local-authority planning registers. There is no official national planning-application
API, so this data is **not** Crown-copyright open data licensed under the OGL; it is sourced from PlanIt's
aggregation of the underlying public council registers. Each application in the app links to the council's
own record, which is the authoritative source for its status and detail.

## ODbL note for committed datasets

The following committed JSON files are **Derivative Databases of OpenStreetMap** and are therefore made
available under the **Open Database Licence (ODbL)** — © OpenStreetMap contributors:

- `src/data/stations.json` (rail/metro/tram/light-rail stations)
- `src/data/amenities.json` (everyday-amenity coordinates)
- `src/data/ev-charging.json` (public EV charging locations)

All other committed datasets in `src/data/` are derived from UK public-sector sources under the Open
Government Licence v3.0 (or, for EPC, the EPB reuse terms), as listed above.

## No affiliation

Locale is not affiliated with, endorsed by, or operated by any of the data providers named above.
