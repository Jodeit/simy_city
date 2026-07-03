# SIMyCity autonomous backlog

Prioritized, self-contained improvements. The background automation (a scheduled
"routine") picks the **top unchecked item it can finish in one session**, ships
it verified, checks it off, and stops. Humans can reorder, edit, or add items.

Ground rules for each run:
- Keep changes **small and cohesive** — one item per run.
- **Verify before pushing to `main`** (main auto-deploys to GitHub Pages):
  `python -m pytest -q` passes, `simy validate` passes, `python tools/build_model_json.py`
  runs, and — if a browser is available — `web/explore.html` and `web/index.html`
  load with **zero JS console errors**. If anything fails, push to a `wip/*`
  branch instead and note it.
- Never commit secrets. Never break the live site. When unsure, prefer
  docs/tests-only progress.

## Now (high value)
- [ ] **Satellite-first option + confirm parcel overlay endpoint.** Verify the
      `taxmaps.traviscountytx.gov` parcel export renders; if not, swap to
      `gis.traviscountytx.gov`/`geo.traviscountytx.gov` MapServer. Consider making
      Satellite the default base with parcels on top (most intuitive for "look at
      this lot").
- [ ] **Real verdicts for the other uses.** fast_casual: use a daytime/POI proxy;
      data_center: a true PASS/SHORT from nearest-substation distance + parcel
      acreage (≥10 ac) + water-district presence, not rooftops. residential: infer
      induced school load vs nearby school count.
- [ ] **FEMA flood check.** Add a FEMA NFHL flood-zone query on parcel click
      (floodway/100-yr) and a flood overlay toggle. Registry already lists `fema_nfhl`.
- [ ] **Loading & empty polish.** Skeleton loaders, nicer parcel/error states,
      a favicon, and a tighter mobile layout for the side panel.

## Next (breadth)
- [ ] **More parcel counties.** Generalize `PARCEL_SOURCES` beyond Travis — add
      2–3 big metros with open ArcGIS parcel layers (each is one config entry).
- [ ] **Census ACS demographics.** Pull real households/income/age for the click's
      tract (keyless if the API allows low-volume; else document the key path).
      Replace the rooftop *proxy* with real household counts where available.
- [ ] **Compare parcels.** Pin several parcels and compare their reads side by side.
- [ ] **JS model unit tests in CI.** Port the mocked node checks (perspectives,
      standoffs, fit, demand parsing) into a committed test run in CI.

## Polish / stretch
- [ ] Slope/contour overlay (USGS) toggle.
- [ ] Shareable "make the case" as an image/PDF export.
- [ ] Accessibility pass (keyboard, ARIA, contrast) and performance (debounce,
      cache Overpass responses per session).
- [ ] Landing page: embed a live screenshot/GIF of the explorer.

## Done
- [x] Two-lane UX (Explore vs Test a use) with a real CTA.
- [x] Live demand read + real "why no Costco here" verdict (rooftops vs threshold).
- [x] Parcel identification (boundary + county record) with projected-CRS fix.
- [x] Developer checklist (topography, MUD, zoning, entitlements, availability).
- [x] Base-map switcher + TCAD parcel overlay + listing deep-links.
- [x] GitHub Pages auto-deploy from `main`.
