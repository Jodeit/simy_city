# Standing on the shoulders of giants

SIMyCity is **integration, not invention**. A huge amount of the hard work —
street-network math, routing engines, parcel and building data, city simulation —
already exists as excellent open source. Our job is to *connect* those giants
around one civic question ("what should happen on this parcel, and why?"), not to
rebuild them. This page is the running credit list and a map of where we plug in.

> If you maintain one of these and we've mischaracterized it, please open a PR —
> we want this page to be accurate and generous.

## The lineage (and why we're open)

The closed, well-funded attempts at "model the built world" came first — Google's
moonshot **Flux** (building/urban data), and more recently **Anori**, alongside
commercial platforms like **Replica** (ex-Sidewalk Labs), **UrbanFootprint**, and
**Placer.ai**. They proved the idea is valuable. SIMyCity's bet is that the
*public-good* version should be **open, free-data-first, and community-tended** —
because the questions ("why is my community the way it is, and what would it take
to change it?") belong to the community.

## City simulation & "what-if" games — the SimCity spirit

| Project | What it does | How SIMyCity relates |
|---|---|---|
| [**A/B Street**](https://github.com/a-b-street/abstreet) | Open-source traffic simulation + street-editing game on public data; teaches 15-minute neighborhoods | The gold standard for "serious civic question as a playable tool on open data." We aim for the same ethos at the parcel/land-use altitude rather than the street/traffic altitude. |
| [**Citybound**](https://github.com/citybound/citybound) | Open-source, multiplayer city-sim with microscopic agent simulation (Rust) | Inspiration for emergent, dependency-driven dynamics — our `enabling_edges`/standoffs are a data-grounded cousin of its feedback loops. |
| [**KotCity**](https://github.com/kotcity/kotcity) | Open-source SimCity-like builder | Reference for approachable city-builder UX. |

## Urban analysis engines — the math we don't rewrite

| Project | What it does | Where we use it |
|---|---|---|
| [**OSMnx**](https://github.com/gboeing/osmnx) (Geoff Boeing) | Download/model/analyze street networks from OpenStreetMap | Road network + walkability for trade-area and access analysis |
| [**Pandana**](https://github.com/UDST/pandana) (UDST) | Fast network accessibility / shortest-path aggregation | "How much is reachable within N minutes" at scale |
| [**UrbanAccess**](https://github.com/UDST/urbanaccess) (UDST) | Multimodal (transit + pedestrian) accessibility from GTFS+OSM | Transit-aware trade areas |
| [**UrbanSim**](https://github.com/UDST/urbansim) (UDST) | Statistical models of real-estate/demographic change under policy scenarios | Long-run "what if we build this" forecasting (M3+) |
| [**r5py**](https://github.com/r5py/r5py) / [**OpenTripPlanner**](https://www.opentripplanner.org/) / Conveyal R5 | High-performance multimodal routing | Alternative isochrone backends |
| [**OSRM**](https://github.com/Project-OSRM/osrm-backend) · [**Valhalla**](https://github.com/valhalla/valhalla) · [**openrouteservice**](https://openrouteservice.org/) | Routing engines / isochrones on OSM | Drive-time trade areas (in the registry today) |

## The data giants — what feeds the model

| Source | What it is | In our registry |
|---|---|---|
| [**OpenStreetMap**](https://www.openstreetmap.org/) | The open map of the world (POIs, roads, buildings) | `osm_overpass`, `nominatim` |
| [**Overture Maps**](https://overturemaps.org/) | Open buildings/places/transportation (Linux Foundation) | `overture_buildings` |
| [**U.S. Census**](https://www.census.gov/data/developers.html) | Demographics, business patterns, commute flows, geometries | `census_acs5`, `census_cbp_zbp`, `lehd_lodes`, `census_tiger` |
| [**OpenAddresses**](https://openaddresses.io/) | Open global address points | (candidate geocoding source) |
| **Federal/agency open data** | FCC, EIA, EPA, USGS, FEMA, NCES, HIFLD, USFWS, NLCD/MRLC, GBIF | 20+ entries — see `registry.yaml` |

## Visualization — how we'll show it

| Project | Role |
|---|---|
| [**MapLibre GL**](https://maplibre.org/) / [**Leaflet**](https://leafletjs.com/) | Base maps for the web frontend |
| [**deck.gl**](https://deck.gl/) / [**kepler.gl**](https://kepler.gl/) (vis.gl) | Large-scale geospatial layers & exploratory viz |

## Community knowledge

| Resource | Why it matters |
|---|---|
| [**APA Technology Division — planning resources**](https://github.com/APA-Technology-Division/urban-and-regional-planning-resources) | Community-maintained index of built-environment data & tools; a model for our registry's spirit |
| [**Urban Data Science Toolkit (UDST)**](https://github.com/udst) | The reference org for open urban analytics in Python |

## So what is SIMyCity actually adding?

Not another routing engine or city sim. The **missing connective layer**:

1. A **machine-readable registry** that ties dozens of public datasets to the
   *decisions* they inform (`data_sources/registry.yaml`).
2. A **dependency model** that says what a land use needs and induces, and finds
   the **chicken-and-egg standoffs** between uses (`standoffs.py`).
3. A **multi-stakeholder "should we?" layer** that holds developer, resident,
   environmentalist, and municipality views in tension (`perspectives.py`).
4. A **community + spare-token contribution model** so all of the above grows
   while we sleep (`docs/contributing.md`).

Everything underneath, we happily borrow. That's the point.
