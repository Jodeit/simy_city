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
- [x] **Real data_center verdict.** data_center previously showed no PASS/FAIL
      at all (rooftops don't matter for siting a data center). Added a real
      three-gate PASS/SHORT — nearest power substation ≤5 km (from the
      existing live Overpass competitor scan), parcel acreage ≥10 ac (from
      the existing county parcel read), and presence inside a mapped water
      district (from the existing MUD/water-district checklist check) — all
      three legs reuse data the app was already fetching, combined into one
      verdict once all three resolve. Verified in headless Chromium: page
      loads clean, clicking a parcel with `data_center` selected doesn't
      throw, and directly driving the render function through PASS / SHORT /
      unknown-data states produces correct verdict text and CSS classes with
      zero console errors. Outbound network to Overpass/ArcGIS is blocked
      from this sandbox, so a live end-to-end substation/parcel/district
      fetch on the real site is a good human spot-check.
- [x] **Satellite-first + resilient parcel overlay endpoint.** Satellite is now
      the default base layer (parcels on top) — most intuitive for "look at this
      lot" before diving into data. The parcel *tile* overlay (`ArcGISDynamic`)
      previously hardcoded a single host (`taxmaps.traviscountytx.gov`); it now
      tries `geo.traviscountytx.gov`'s TCAD MapServer per-tile if the primary
      host errors, matching the fallback the point-query already had. Outbound
      network to these hosts is blocked from this sandbox (proxy policy — see
      `/root/.ccr/README.md`), so live rendering of the fallback host couldn't be
      confirmed this run; verified instead that both hosts are real MapServer
      `/export`-capable services (per `PARCEL_SOURCES`) and that the change is
      JS-error-free end to end (load + simulated map click) in headless Chromium.
      Worth a human spot-check on the live site.
- [x] **Real verdict for fast_casual.** Blended a daytime-population proxy
      (nearby offices/shops/workplaces within a 3 km lunch-drive radius, live
      via Overpass) into the rooftop demand read (`blendedDemand()` in
      `web/logic.js`) so an office-park or retail-heavy spot with few homes
      nearby can still clear the bar, instead of judging on rooftops alone.
      Waits for both legs before rendering one verdict, same pattern as the
      data_center siting check. Added unit tests for the blend math.
- [x] **Real verdict for residential_subdivision.** Projects parcel acreage
      (`showParcel`) into est. homes via a documented density assumption
      (3 units/ac), then into school-age kids at 0.5 students/home (matching
      the `induces.education` note already in `layers.yaml`), and compares
      against a capacity proxy from the nearby-school count already fetched
      via Overpass (750 seats/school) — same wait-for-both-legs pattern as the
      data_center and fast_casual verdicts (`maybeRenderResVerdict`). Verified
      in headless Chromium: both pages load and a map click doesn't throw, and
      directly driving the render function through PASS / SHORT /
      capacity-unavailable / no-acreage states produces correct verdict text
      and CSS classes with zero console errors. Outbound network to
      Overpass/ArcGIS is blocked from this sandbox, so a live end-to-end
      acreage/school fetch on the real site is a good human spot-check.
- [x] **FEMA flood check.** Added a live FEMA NFHL flood-zone point query to the
      developer checklist (floodway / 100-yr Special Flood Hazard Area / outside
      floodplain), same pattern as the topography/MUD checks. A flood *overlay
      toggle* (visual layer on the map, not just the point read) is still open —
      moved to Next.
- [x] **Loading & empty polish.** Fixed a real bug where parcel,
      fit-list, topography, and MUD/district results stayed stuck in the grey
      italic "loading" style forever (the class was never cleared once data
      arrived); added a distinct amber "unavailable" style for genuine fetch
      failures vs. a pulsing animation for in-progress loads; added a favicon;
      tightened the mobile side-panel spacing.

## Next (breadth)
- [ ] **FEMA flood overlay toggle.** The developer checklist now shows a live
      point read of the FEMA flood zone (see Now, done); add a visual map
      overlay (WMS/tile layer) so floodway/100-yr zones are visible before
      you even click, not just after.
- [ ] **More parcel counties.** Generalize `PARCEL_SOURCES` beyond Travis — add
      2–3 big metros with open ArcGIS parcel layers (each is one config entry).
- [ ] **Census ACS demographics.** Pull real households/income/age for the click's
      tract (keyless if the API allows low-volume; else document the key path).
      Replace the rooftop *proxy* with real household counts where available.
- [ ] **Compare parcels.** Pin several parcels and compare their reads side by side.
- [x] **JS model unit tests in CI.** Extracted the pure logic (perspectives,
      standoffs, demand/parcel parsing) from `web/explore.html` into a shared
      `web/logic.js` (loaded as a plain `<script>` in the browser, `require()`d
      in tests — no build step), added `tests/js/model-logic.test.mjs` (Node's
      built-in test runner, 23 cases incl. an integration check against the
      real compiled `model.json`), and wired `node --test tests/js` into CI.

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
