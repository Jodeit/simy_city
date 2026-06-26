# The Public-Data Landscape for simy_city

*Research doc — the free datasets that let us model parcels and their
infrastructure dependencies, why each matters, and how to reach it. The
machine-readable version is [`data_sources/registry.yaml`](../data_sources/registry.yaml);
this document is the narrated companion.*

Last reviewed: 2026-06. Endpoints/auth verified against provider docs at that
time — treat the registry's `access` block as the source of truth and update it
when providers change.

---

## How to read this

For our two questions — *"why no Costco/Chipotle nearby?"* and *"would my
development succeed, and what does it depend on?"* — the data falls into three
jobs:

1. **Demand & competition** — is there a market, and is it already served?
2. **Infrastructure supply** — power, water, broadband, roads: what's available
   near a parcel and at what capacity?
3. **Induced services & constraints** — schools, hospitals, fire/EMS, plus
   flood/terrain that gate what can be built.

Every source below is free. Many need only a free API key or account (noted).

---

## 1. Demand & competition

### Census ACS 5-Year (`census_acs5`) — the demand backbone
The American Community Survey gives population, income, age, household size and
housing-unit counts down to **block-group** resolution via a clean JSON API
(`api.census.gov/data/2023/acs/acs5`, free key). This is the denominator for
almost every retail-siting question. **For 78738:** it confirms the area is
high-income — which is exactly why the missing-Costco answer must lie elsewhere
(geography, not money).

### Building footprints (`overture_buildings`) — true rooftop density
Income tells you spending *per* household; **rooftop counts** tell you *how
many*. Overture/Microsoft footprints (global, free GeoParquet, queryable with
DuckDB) give the physical built density. In low-density Hill Country this is the
crux: a 10-mile radius around 78738 holds far fewer rooftops than the same radius
in suburban Austin.

### Business Patterns (`census_cbp_zbp`) & QCEW (`bls_qcew`) — saturation & daytime market
County/ZIP Business Patterns counts establishments by NAICS industry — i.e. *how
many grocery stores / warehouse clubs / restaurants already exist* in a ZIP. BLS
QCEW adds employment and wages by industry/county. Together they measure
**competitive saturation** and the **daytime** (work-hour) market that fast-casual
restaurants like Chipotle live on.

### LODES (`lehd_lodes`) — where people actually go
Block-level jobs and home→work commute flows. Reveals that 78738's economic
"trade area" is shaped by commuting into Austin — the resident headcount
understates the captured market along the corridor.

### OpenStreetMap / Overpass (`osm_overpass`) — the competitor map
The single most useful free POI layer. One Overpass query locates the *existing*
Costco, every Chipotle, the grocery stores, schools, fire stations and the road
network. ODbL-licensed (attribution + share-alike). This is how we answer "how
far is the nearest one *today*."

---

## 2. Access & trade area (the usual real reason)

### openrouteservice / OSRM (`openrouteservice`) — drive-time isochrones
Retail siting is about **drive time, not radius**. A warehouse club wants a large
household count inside ~10–15 minutes' drive. openrouteservice returns isochrone
polygons (free key, ~2k/day; self-host OSRM/Valhalla for unlimited). **For 78738:**
the lake and the sparse arterial grid (RR 620, TX-71, Bee Cave Rd) shrink the
real 15-minute trade area well below what a circle implies — likely the genuine
reason a warehouse club hasn't penetrated west.

### NTAD roads & traffic (`ntad_roads`)
National road network with **AADT** (annual average daily traffic) counts.
Retailers care about cars-past-the-door; this quantifies corridor exposure.

---

## 3. Power (gate #1 for a data center)

### EIA Open Data v2 (`eia_opendata`)
Generator inventory, fuel mix, generation, and **retail electricity prices** via
a clean API (free key). First-order question: is there spare generation in the
region and what does power cost.

### HIFLD energy layers (`hifld_power`)
The *geospatial* counterpart — power plants, **substations**, and **transmission
lines** with voltages as GIS features. A data center can't just "plug in"; its
viability turns on proximity to high-voltage capacity, and this is the layer that
measures it.

### ERCOT (`ercot_grid`) — the Texas superpower
78738 is inside ERCOT. ERCOT publishes the **interconnection queue** (where large
new loads and generators are already lined up), system load, and generation mix.
This directly answers *"can the grid here absorb a 100 MW data center, and what
scale of upgrade would it force?"* — large loads trigger formal interconnection
studies. No other region gives this much public visibility into grid headroom.

### NREL (`nrel_resource`)
Solar resource and **utility-rate** lookups (free key) — which utility serves a
parcel and at what $/kWh, plus on-site solar potential.

---

## 4. Water (gate #2)

### EPA SDWIS / ECHO (`epa_sdwis_echo`)
Which **public water system** serves a location, the population it serves, source
type, and discharge (NPDES) permits. Decisive for water-hungry uses — evaporative
data-center cooling, manufacturing — especially in a drought-prone region.

### USGS NHD & Water Services (`usgs_nhd_water`)
Streams, water bodies, watersheds and **stream-gauge flows**. Provides Lake
Travis / Colorado River supply context and watershed constraints.

---

## 5. Broadband (gate #3)

### FCC National Broadband Map / BDC (`fcc_bdc`)
Location-level availability by provider and technology (fiber / cable / fixed
wireless), with max advertised speeds. Free API token (via "Manage API Access")
plus semiannual bulk snapshots. **For 78738:** tells us whether the *redundant
high-capacity fiber* a data center or office needs actually reaches a parcel —
much of the Hill Country is still cable / fixed-wireless only.

---

## 6. Induced public services

### Schools — NCES / EDGE (`nces_schools`)
School locations, districts, grade ranges and **enrollment**. New rooftops induce
K-12 demand; we compare against enrollment headroom (Lake Travis ISD, Eanes ISD)
to flag when a development "needs a school."

### Fire / EMS / Police & Hospitals — HIFLD (`hifld_civic`) + CMS (`cms_hospitals`)
Public-safety stations and health facilities with capacity (beds). Feeds the
threshold logic: *at what scale does a development require a new fire station or
support a clinic?* In unincorporated Travis County this maps to ESD (Emergency
Services District) coverage and response-time gaps.

---

## 7. The parcel itself & hazards

### Travis County parcels (`tcad_parcels`)
The "if I buy *this* plot" layer: boundary, acreage, land use, ownership and
appraised value, served as GeoJSON/WFS from the county TNR GeoHub and TCAD.
Parcel data is **county-by-county** nationally (no single free national layer),
so we model the county-portal pattern here and generalize the connector later.

### FEMA flood (`fema_nfhl`) & USGS elevation (`usgs_3dep`)
Hard developability constraints. The Hill Country is "Flash Flood Alley" — FEMA
floodway/100-year zones can rule out building near creeks and the lake — and
**slope** from 3DEP drives grading cost (a steep lot can cost far more to develop
than a flat one at the same price).

---

## Coverage & gaps (as of this milestone)

Run `simy report` for the live count. At v0.1.0 the **thin** layer is
**broadband** (one source, `fcc_bdc`) — acceptable, since the FCC map is
authoritative, but a state/local fiber dataset would add redundancy. Everything
else has ≥2 independent sources.

Known gaps to fill next:
- **Zoning / entitlements** beyond raw land use (often only in municipal portals).
- **Foot-traffic / visit data** — the best sources (Placer.ai, SafeGraph/Advan)
  are largely commercial; OSM + ACS + LODES are our free proxy for now.
- **Real-time utility capacity** — EIA/ERCOT give regional headroom, but
  parcel-level "can this substation take 20 MW" still needs a utility inquiry.

These gaps are exactly the kind of thing the contributor queue
([`docs/contributing.md`](contributing.md)) is designed to chip away at.

---

## Sources (provider documentation)

- [Census ACS 5-Year API](https://www.census.gov/data/developers/data-sets/acs-5year.html)
- [Census Business Patterns API](https://www.census.gov/data/developers/data-sets/cbp-nonemp-zbp.html)
- [LEHD LODES](https://lehd.ces.census.gov/data/)
- [BLS QCEW Open Data](https://www.bls.gov/cew/additional-resources/open-data/home.htm)
- [OpenStreetMap Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [openrouteservice API](https://openrouteservice.org/dev/#/api-docs)
- [USDOT NTAD](https://www.bts.gov/ntad)
- [EIA Open Data](https://www.eia.gov/opendata/documentation.php)
- [HIFLD Open](https://hifld-geoplatform.hub.arcgis.com/)
- [ERCOT Grid Info](https://www.ercot.com/gridinfo)
- [NREL Developer APIs](https://developer.nrel.gov/docs/)
- [EPA ECHO Web Services](https://echo.epa.gov/tools/web-services)
- [USGS National Hydrography](https://www.usgs.gov/national-hydrography)
- [FCC Broadband Data Collection](https://www.fcc.gov/BroadbandData/resources)
- [NCES EDGE](https://nces.ed.gov/programs/edge/)
- [CMS Provider Data](https://data.cms.gov/provider-data/)
- [Travis County TNR GeoHub](https://tnr-traviscountytx.hub.arcgis.com/)
- [Overture Maps](https://docs.overturemaps.org/)
- [FEMA National Flood Hazard Layer](https://www.fema.gov/flood-maps/national-flood-hazard-layer)
- [USGS 3DEP](https://www.usgs.gov/3d-elevation-program)
