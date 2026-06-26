# Worked example — 78738 (Bee Cave / Lake Travis)

A narrative walkthrough of how `simy_city` *will* answer the founding questions
for this ZIP, mapping each step to the registry sources that feed it. Until the
M1 connectors land, this is the hypothesis the data will test — not yet computed
numbers.

## Q1: "Why hasn't Costco opened closer to me?"

The model checks the `warehouse_club` requirements (`data_sources/layers.yaml`)
against measured supply around 78738:

| Requirement | Source(s) | Hypothesis for 78738 |
|---|---|---|
| ≥100k households within 15-min drive | `census_acs5`, `overture_buildings`, `openrouteservice` | **Likely fails.** Lake Travis splits the road network; the true 15-min isochrone west of the lake captures far fewer rooftops than a radius suggests. |
| 0 same-brand competitors in trade area | `osm_overpass` | Existing Costcos (SW Austin / Cedar Park) already cover the eastern, denser slice of any trade area drawn here. |
| Near highway with AADT ≥40k | `ntad_roads` | TX-71 carries traffic, but the dense-rooftop side faces existing stores. |
| ≥15 buildable flat acres | `tcad_parcels`, `usgs_3dep`, `fema_nfhl` | Hill Country terrain + flood zones limit large flat pads. |

**Expected verdict:** it's a *drive-time household count* problem, not an income
problem — the model should show the binding constraint is rooftops-within-reach,
with terrain and existing-store cannibalization as supporting factors.

## Q1b: "...and Chipotle?"

`fast_casual` leans on **daytime** population and traffic, not nighttime
rooftops (`bls_qcew`, `lehd_lodes`, `ntad_roads`). The hypothesis: Chipotle
follows a retail/office anchor with lunch traffic; 78738 needs that daytime node
(e.g. the Hill Country Galleria area) to clear the bar, which narrows the viable
parcels to a handful of corridors.

## Q1c: "...and why aren't housing developers building the rooftops?"

If rooftops are what bring retail, the next question is why developers haven't
added them. A 78738 parcel can be buildable yet idle because the *demand signals*
are split across a standoff (`simy standoffs`):

- Developers want **amenities + jobs + fast absorption** before committing.
- Retail/amenities want **rooftops** before committing.
- Each waits on the other; nobody moves first.

The model's cheapest break for the housing↔fast-casual loop is a single
**fast-casual amenity anchor** (low cost) — versus seeding an **employment
center** (high cost). That's an actionable lever, and exactly the kind of
coordination problem a community (or a city incentive) can solve where no single
private actor will. See `docs/feedback-loops.md`.

## Q2: "If I bought a plot and built a data center, would it succeed?"

The model walks `data_center` `requires` → `induces`:

| Gate | Source(s) | What the model reports |
|---|---|---|
| Power ≥20 MW, substation ≤5 km | `hifld_power`, `eia_opendata`, `ercot_grid` | Distance to nearest substation + transmission, regional headroom, and **ERCOT interconnection-queue** position. A >50 MW load likely forces an interconnection study. |
| Water ≥1 MGD (evaporative cooling) | `epa_sdwis_echo`, `usgs_nhd_water` | Serving water system & its capacity; drought context flags air-cooled designs. |
| Redundant fiber, ≥100 Gbps | `fcc_bdc` | Whether ≥2 fiber routes actually reach the parcel — often the silent dealbreaker in the Hill Country. |
| ≥10 buildable acres, low slope, no floodway | `tcad_parcels`, `usgs_3dep`, `fema_nfhl` | Buildable-acre count after removing slope + flood constraints. |

Then the `induces` edges: a large electrical/hazmat load may raise **ESD/fire**
requirements (`hifld_civic`), and the transmission upgrade itself becomes a
project dependency.

**Expected verdict:** power + fiber are the gating pair here; water and ERCOT
queue timing decide *scale and schedule* more than yes/no.

## Q3: "Should the data center be built here at all?"

Feasible and profitable is not the same as *should*. Through the stakeholder lens
(`simy perspectives data_center`), 78738 makes the conflict vivid:

| Stakeholder | Leaning | Why (78738) |
|---|---|---|
| Developer | favorable | cheap edge land, ERCOT power market |
| Resident | opposed | traffic + loss of Hill Country character |
| Environmentalist | opposed | high carbon + **water stress in a drought region** + clearing oak-juniper (golden-cheeked warbler habitat), often over the **Edwards Aquifer recharge zone** |
| Municipality | mixed | tax base vs. induced services + utility upgrades |

The model returns **CONTESTED** — the honest answer. The ecology sources
(`usfws_critical_habitat`, `tceq_edwards_aquifer`, `nlcd_landcover`) are what will
turn those qualitative leanings into measured ones at a specific parcel. See
`docs/stakeholders.md`.

## Try the model surface today

```bash
simy use warehouse_club             # the dependency profile behind Q1
simy standoffs                      # the housing/retail standoff behind Q1c
simy use data_center                # the dependency profile behind Q2
simy perspectives data_center       # the competing priorities behind Q3
simy layer power                    # the sources that will answer the power gate
simy report                         # where the data is still thin
```
