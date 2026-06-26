# Roadmap

From a data catalog to a working real-world SimCity. Each milestone is a usable
artifact, not just scaffolding.

## ✅ M0 — Public-data source registry + research doc (this milestone)
- 28 free datasets cataloged in `data_sources/registry.yaml`, each annotated with
  access/auth/license and 78738 relevance (now including ecology/impact sources:
  USFWS habitat, PAD-US, NLCD, GBIF, TCEQ Edwards Aquifer).
- SimCity-style model in `data_sources/layers.yaml`: service layers; land uses
  with requires/induces edges; **enabling edges** (chicken-and-egg standoffs);
  **impacts + stakeholders** (the "should we develop?" question).
- Validated loader + query API + CLI
  (`simy report/layer/use/standoffs/perspectives/todo/validate`).
- Detectors: `standoffs.py` (feedback loops), `perspectives.py` (competing POVs).
- Docs: data landscape, feedback loops, stakeholders, architecture, contribution.

## M1 — First connectors + a real trade area
Make the data *move*, starting with the cheapest high-value sources:
- Connectors: `nominatim`, `census_acs5`, `osm_overpass`, `openrouteservice`.
- Compute a real **drive-time trade area** around a 78738 address and the
  households/competitors inside it.
- Deliverable: a notebook/CLI that answers *"nearest Costco & Chipotle, and how
  many households are within 15 minutes of this parcel."*

## M2 — The dependency engine
- `simy_city/depgraph.py` + `score.py`: feasibility, gap analysis, induced demand.
- Add power/water/broadband connectors (`eia_opendata`/`hifld_power`,
  `epa_sdwis_echo`, `fcc_bdc`) and the `tcad_parcels` connector.
- Deliverable: *"if I build a data center on parcel X, here's the pass/fail per
  dependency and what upgrades it would force"* — for a real Travis County parcel.

## M3 — Web frontend
- React + MapLibre map: drop a land use on a parcel, see isochrone + per-layer
  capacity + reasons.
- Read-only public API over the engine.

## M4 — Community & automation platform
- Wire up the `agent-ready` task queue from `docs/contributing.md`.
- CI gates, connector fixture harness, contribution leaderboard.
- Generalize Travis-County-specific connectors to national equivalents.

## Guiding constraint
Every milestone stays **explainable and free-data-only**, and keeps proving
itself on **78738** before generalizing.
