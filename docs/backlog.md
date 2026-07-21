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
- [x] **Real verdict for warehouse_club.** The last of the four land uses still
      judged on rooftop demand alone. Blended the existing rooftop trade-area
      read with the site-size gate `layers.yaml` already documents for it
      (`parcel: { min_buildable_acres: 15 }` — a warehouse club needs a big flat
      pad for the store + parking, not just nearby households) into one
      PASS/SHORT verdict, waiting for both the rooftop leg (`runDemand`) and the
      acreage leg (`showParcel`) — same wait-for-both-legs pattern as the
      data_center/fast_casual/residential_subdivision verdicts
      (`maybeRenderWCVerdict`). Verified in headless Chromium: both pages load
      with zero page/console errors; driving the render function directly
      through PASS / SHORT-on-site-size / SHORT-on-demand / acreage-unavailable
      / no-rooftop-read / wrong-use-selected states produced correct verdict
      text and CSS classes; and a full simulated map click with `warehouse_club`
      selected renders the whole result panel without throwing. Outbound
      network to Overpass/ArcGIS is blocked from this sandbox, so a live
      end-to-end rooftop/acreage fetch on the real site is a good human
      spot-check.
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
- [x] **FEMA flood overlay toggle.** Added a visual map overlay for the same
      FEMA NFHL "Flood Hazard Zones" layer (28) the developer checklist already
      point-queries — rendered as ArcGIS export tiles via the existing
      `arcgisDynamic` helper (same pattern as the TCAD parcel-line overlay),
      registered in the Leaflet layer switcher as "FEMA flood zones", off by
      default (opt-in toggle; nationwide coverage, no bbox needed). Verified
      in headless Chromium: page loads clean, the layer toggles on/off via
      `map.addLayer`/`removeLayer` (same call the layer-control checkbox
      makes) with zero console errors. Outbound network to
      hazards.fema.gov is blocked from this sandbox, so live tile rendering
      is a good human spot-check.
- [x] **More parcel counties.** Generalized `PARCEL_SOURCES` beyond Travis —
      added Maricopa County, AZ (Phoenix; `mcassessor.maricopa.gov` ArcGIS
      MapServer, `APN`-keyed record deep-link) and Harris County, TX (Houston;
      `gis.hctx.net` HCAD ArcGIS MapServer; HCAD's public record pages are
      keyed by an opaque token rather than the account number, so that one
      links to the search page instead of a per-parcel deep link). Extended
      the parcel-attribute `pick()` field lists to cover each county's actual
      field names (`APN`, `HCAD_NUM`/`acct_num`, `owner_name_1`, `land_use`,
      `acreage`, `total_appraised_val`, etc.), and de-hardcoded the
      Travis-only "TX counties don't zone" / "Travis County, TX" listing-search
      text into a per-source `zoning_note`/`county_state` (Arizona counties,
      unlike Texas, do zone unincorporated land — the old copy would've been
      wrong for Maricopa). Verified in headless Chromium: both pages load
      clean; `PARCEL_SOURCES`/`inBbox` correctly route sample coordinates in
      all three counties (and correctly find no source for an out-of-coverage
      point); `showParcel` was driven directly with mock Maricopa/Harris
      ArcGIS attribute payloads (including an empty-attributes case) and
      rendered correct fields, appraised-value formatting, and record links
      with zero console errors. Live ArcGIS endpoint reachability (field
      names, real APN/HCAD_NUM formats) couldn't be confirmed from this
      sandbox — outbound network to `*.arcgis.com`/county GIS hosts is
      blocked — so a live spot-check in each county is a good human follow-up.
- [x] **Census ACS demographics.** Added a real "Census tract (ACS)" row to the
      developer checklist: a keyless FCC block lookup (`geo.fcc.gov/api/census/area`)
      turns the clicked lat/lng into a tract FIPS, then the keyless (at low
      volume) Census ACS 5-yr API pulls that tract's households, median
      household income, and median age (`tryAcsYear` falls back across
      2023→2021 vintages, same multi-source-fallback pattern as the district/
      parcel lookups). This is real per-tract demographic context, not a
      replacement for the multi-km rooftop trade-area read above it — a single
      census tract is much smaller than a warehouse-club/fast-casual trade
      area, so summing ACS tracts across a multi-km radius (a real "replace
      the rooftop proxy" project) is left as a larger follow-up. Added pure
      parsing-helper unit tests (`parseFccBlockFips`, `parseAcsTractRow`,
      including the Census large-negative suppression-sentinel case) and
      verified in headless Chromium with mocked `fetch`: the success path,
      an all-years-empty ACS response, and an unreachable FCC lookup all
      render correct text with zero console errors. Outbound network to
      `geo.fcc.gov`/`api.census.gov` is blocked from this sandbox, so a live
      spot-check on the real site is a good human follow-up.
- [x] **Compare parcels.** Added a 📌 "Pin to compare" button to every parcel
      analysis (both Explore and Test-a-use modes), a header "⚖️ Compare (N)"
      link, and a modal with a side-by-side table (address/owner, acreage,
      appraised value, land use, county, and — in Test-a-use — the use and
      its verdict text). Pins read the already-resolved `lastParcelSummary`
      snapshot (no extra network calls), persist to `localStorage` (same
      client-side-only privacy pattern as "bring your own data"), cap at 6,
      reject duplicates/stale snapshots, and each row's site name re-navigates
      the map back to that parcel. Verified in headless Chromium by driving
      `addPin()`/`removePin()`/`renderCompare()` directly (duplicate + stale-seq
      rejection, table render, clear-all → empty state) and by cycling all 4
      land uses end to end — zero console/page errors.
- [x] **JS model unit tests in CI.** Extracted the pure logic (perspectives,
      standoffs, demand/parcel parsing) from `web/explore.html` into a shared
      `web/logic.js` (loaded as a plain `<script>` in the browser, `require()`d
      in tests — no build step), added `tests/js/model-logic.test.mjs` (Node's
      built-in test runner, 23 cases incl. an integration check against the
      real compiled `model.json`), and wired `node --test tests/js` into CI.

## Polish / stretch
- [x] Slope/contour overlay (USGS) toggle. Added a "USGS slope map" overlay to
      the layer switcher, same opt-in/off-by-default pattern as the FEMA flood
      overlay — reuses the USGS 3DEP elevation dataset already sampled
      point-wise for the "Topography" developer-checklist slope read (EPQS),
      now rendered as a colorized slope map so grading risk is visible on the
      map before you click. Required extending the shared `ArcGISDynamic` tile
      helper: MapServer overlays (county parcels, FEMA) use `/export` +
      `layers=show:N`, but an ArcGIS *ImageServer* (3DEP) uses `/exportImage` +
      a server-side `renderingRule` JSON param instead of a layer id — added an
      `imageServer`/`renderingRule` option so both shapes share the same
      per-tile bbox math and per-host fallback-on-error behavior. Verified in
      headless Chromium: both pages load with zero console/page errors, the
      slope layer is off by default, `map.addLayer`/`removeLayer` (the same
      calls the layer-control checkbox makes) toggle it correctly, and the
      built tile URL has the expected `/exportImage` + `renderingRule` shape
      (confirmed the existing FEMA `/export` URL shape is unchanged). Outbound
      network to `elevation.nationalmap.gov` is blocked from this sandbox, so
      live tile rendering and the exact `"Slope Map"` rendering-rule name are
      a good human spot-check.
- [x] **Shareable "make the case" as an image export.** Added a "🖼️ Download
      image" button next to the existing "Make the case" copy/email tools. It
      renders the same case text onto a from-scratch `<canvas>` (title, wrapped
      body, footer) and downloads it as a PNG — deliberately *not* a
      DOM/map screenshot (html2canvas against Leaflet's cross-origin tiles
      routinely taints the canvas and breaks `toBlob`), so this has zero CORS
      risk anywhere it runs. Added a measure-agnostic `wrapText` word-wrapper
      to `web/logic.js` (takes a `measure(candidateLine)` callback so the same
      wrapping logic runs against a real canvas 2D context in the browser and
      a plain character-count stand-in in tests — no canvas in Node), with 5
      new unit tests (word-boundary wrapping, preserved blank-line section
      breaks, preserved explicit newlines, an over-long single word kept
      whole). Verified in headless Chromium: both pages load with zero
      console/page errors, and driving `downloadCaseImage()` end to end
      (canvas render → `toBlob` → anchor click) produced a real ~32KB PNG
      with zero errors. A PDF variant is left as a follow-up if a vendored
      PDF lib is ever wanted.
- [x] **Cache Overpass/ArcGIS/USGS/Census responses per session.** Added a
      pure, tested `makeSessionCache` (capped in-memory key→promise map with
      oldest-first eviction and eviction-on-failure) to `web/logic.js`, and
      wired it into every read-only lookup `explore.html` makes: Overpass
      demand/competitor queries, the shared `arcgisPointQuery` helper (parcel,
      MUD/district, FEMA flood), USGS topo elevation samples, and the
      FCC-block/Census-ACS tract lookups. Same-point data doesn't change
      mid-session, so re-clicking a parcel or a Compare pin re-navigating the
      map back to one now reuses this session's answers instead of re-hitting
      those services — fewer requests against public APIs and a snappier
      repeat-click. The remaining "debounce, keyboard/ARIA/contrast
      accessibility" half of this item is still open, split out below.
      Verified with 5 new Node unit tests (hit/miss, per-key isolation,
      failure eviction, concurrent-call sharing, cap eviction) and in headless
      Chromium: both pages load with zero console/page errors, and driving
      `overpass()` directly with a mocked `fetch` shows a second identical
      query reuses the cached promise instead of issuing a second request.
- [x] Accessibility pass (keyboard, ARIA, contrast) on the Explore/Test-a-use
      panels. Made the explore-mode "I'm scouting" / "I have a use in mind"
      path cards keyboard-operable (`role="button" tabindex="0"` + a shared
      `wireActivate()` helper firing on Enter/Space, not just click — these
      were plain `<div onclick>`s before, unreachable without a mouse).
      Added `aria-pressed` to the mode-switch and use-selector toggle buttons
      so screen readers announce which is active, and an `aria-label` on each
      pinned-parcel's "✕" remove button (was icon-only with just a `title`).
      Gave both modals (compare-parcels, bring-your-own-data) real dialog
      semantics: `role="dialog"`/`aria-modal="true"`/`aria-labelledby`, focus
      moves to the first focusable control on open, Escape closes and returns
      focus to whatever opened it (not just a backdrop-click handler), and a
      Tab focus trap keeps keyboard focus inside the modal instead of leaking
      into the page/map behind it — a shared `openModal()`/`closeModal()`
      pair used by both. Fixed the one real contrast failure: the amber
      "contested"/"unavailable" text (`#9a6f1c` on `#fdeed6`/white) was
      ~3.9:1–4.5:1, below the 4.5:1 AA threshold for normal-weight text at
      this size; darkened to `#7a5410`, now 5.9:1. Verified in headless
      Chromium: both pages load with zero console/page errors; keyboard-only
      activation of a path card (Tab, Enter) switches mode; `aria-pressed`
      reflects the active mode/use button; opening a modal moves focus in,
      Escape closes it and returns focus to the opener, and Tab past the last
      focusable wraps back to the first (trap holds); computed the new amber
      contrast ratio programmatically (5.92:1). Full keyboard/ARIA audit of
      the map's own controls (Leaflet's vendored layer switcher) is out of
      scope here — that's third-party vendored code, not something this app
      controls the markup of.
- [x] Debounce rapid repeat map clicks so a fast double-click doesn't kick off
      two full Overpass/ArcGIS/topo/census fan-outs (the `reqSeq` staleness
      check already discards the first click's *rendering*, but doesn't stop
      its in-flight requests from firing). Added a small trailing-edge
      `debounce(fn, wait)` to `web/logic.js` and wrapped the map's `"click"`
      handler with it (200ms) — deliberately trailing-only (no leading-edge
      fire), since firing immediately on the first click of a burst would
      still kick off the very fan-out this exists to avoid; only the last
      click in a rapid burst now calls `analyze()` at all. Added 4 unit tests
      (single call, burst collapses to one trailing call with the last args,
      well-spaced calls each fire independently, `cancel()` drops a pending
      call). Verified in headless Chromium: both pages load with zero
      console/page errors, and firing three synthetic `map.fire("click", …)`
      events back-to-back left `reqSeq` unchanged until the debounce window
      elapsed, then bumped it exactly once (for the third click's position) —
      confirming the burst collapsed to a single `analyze()` run end-to-end,
      not just at the unit-test level.
- [ ] Landing page: embed a live screenshot/GIF of the explorer. (Checked into
      this sandbox once: outbound network to map tiles/Overpass/ArcGIS is
      blocked here, so any screenshot captured in-session would show a blank/
      grey map — not representative of the live product, and not something
      worth committing sight-unseen to the homepage. Needs a network-enabled
      environment, or a human to run a capture script and commit the asset.)
- [x] **Shareable permalink for a clicked site.** The click/load wiring
      (`writeHash`/`applyHash` in `web/explore.html`) already existed from an
      earlier run but wasn't checked off and had no tests for the actual
      encode/decode logic. Extracted that logic into pure, testable
      `encodeHash`/`decodeHash` functions in `web/logic.js` — `encodeHash`
      rounds lat/lng to 5 decimals (~1m) and only includes `use` in
      Test-a-use mode; `decodeHash` returns `null` outright for an absent/
      empty hash, and `null` per-field (not NaN or a trusted-verbatim string)
      for an unrecognized `mode`, an unparseable lat/lng, or a missing `use`
      — so `applyHash()` only overrides state the hash actually carries.
      `explore.html`'s `permalink()`/`writeHash()`/`applyHash()` now just
      call these. Added 7 unit tests (round trip in both modes, leading-`#`
      handling, empty-hash null, bad-mode rejection, missing/unparseable
      lat/lng, URI-decoded `use`). Verified in headless Chromium: both pages
      still load with zero JS errors, and loading `explore.html` with a
      synthetic `#mode=build&use=warehouse_club&lat=..&lng=..` hash already
      in the URL correctly switched to Test-a-use mode, selected
      `warehouse_club`, set `lastLatLng` to the encoded point, and rendered a
      full result panel — a real `analyze()` run driven entirely from the
      URL on load, not just on a later click — with zero console errors.
- [x] **Address search box.** Added a "Search an address…" input overlaid on
      the map (centered top, clear of both the desktop zoom control and the
      layer switcher) that geocodes via the free, keyless Nominatim OSM
      search API and jumps straight to the result — `map.setView` +
      `analyze(latlng)`, the same "land on a point and get the full read"
      path a real map click or an incoming permalink takes — instead of
      making people eyeball a lat/lng on the map first. Submit-only (Enter or
      the button), never on keystroke, per Nominatim's usage-policy ban on
      autocomplete-style query volume; the browser's own `Referer` header
      (sent automatically) identifies the app, since `fetch()` can't set a
      custom `User-Agent`. Reuses the existing `netCache` session cache and
      shows clear "no match found" / "lookup failed" states rather than
      hanging silently, same fetch-with-graceful-degradation pattern as the
      other Overpass/ArcGIS/Census reads. Added pure `nominatimUrl`/
      `parseNominatimResult` helpers to `web/logic.js` (URL shape, first-hit
      parsing, empty-results/malformed-response → null) with 5 new unit
      tests. Verified in headless Chromium: both pages load with zero
      console/page errors; driving the form submit with a mocked `fetch`
      through the success, no-match, and network-failure paths rendered the
      correct result panel / status text / CSS classes each time with zero
      console errors; screenshots at desktop and mobile viewports confirm the
      search bar doesn't overlap the zoom control or (expanded or collapsed)
      layer switcher. Outbound network to `nominatim.openstreetmap.org` is
      blocked from this sandbox, so a live end-to-end address lookup on the
      real site is a good human spot-check.
- [x] **Multi-tract Census ACS trade area.** The single-tract "Census tract
      (ACS)" row reads only the ~1-3k-household tract under the pin — far
      smaller than the fast_casual/warehouse_club multi-km rooftop trade area.
      Neither the FCC block API nor the Census ACS API support a bbox/radius
      query (point lookups only), so added a point-sampling proxy instead:
      `sampleTradeAreaPoints` (center + 8 compass-bearing points at 60% of the
      use's own `USE_DEMAND[current].radius`, same radius the rooftop demand
      read already uses), `dedupeTracts` (collapses the up-to-9 FCC lookups
      to unique state+county+tract, since neighboring sample points often
      land in the same tract), and `aggregateAcsTracts` (household-weighted
      roll-up of each unique tract's ACS row — sum for households, weighted
      average for income/age, tracts missing a field excluded from just that
      field's average). Wired up as a new "🏘️ Trade-area demographics (ACS)"
      checklist row, shown only for the two land uses with a multi-km demand
      read (`AMENITY_USES` — fast_casual, warehouse_club) in Test-a-use mode,
      alongside (not replacing) the existing single-tract row. Added 11 new
      unit tests for the three pure helpers. Verified in headless Chromium:
      both pages load with zero console/page errors; a real simulated map
      click with `warehouse_club` selected runs the whole fan-out without
      throwing; and driving `runCensusTradeArea` directly with a mocked
      `fetch` through both the multi-tract success path (3 unique tracts →
      correct sum/weighted-average text) and an all-FCC-lookups-unreachable
      path rendered correct text/CSS with zero console errors. Outbound
      network to `geo.fcc.gov`/`api.census.gov` is blocked from this sandbox,
      so a live spot-check on the real site (does the 9-point sample actually
      land in several distinct tracts in a real trade area) is a good human
      follow-up.
- [x] **One more parcel county.** Added Bexar County, TX (San Antonio) as a
      4th `PARCEL_SOURCES` entry — `maps.bexar.org`'s ArcGIS `Parcels/MapServer/0`
      (found via web search since the sandbox can't reach ArcGIS hosts directly
      to introspect field names; the URL itself was confirmed live and indexed).
      Bexar's field names weren't independently confirmed (403s on every ArcGIS
      REST introspection attempt from this sandbox — likely bot-blocking, not a
      dead host), so no new names were added to the shared `pick()` lists: Texas
      CADs commonly export the same PACS-style field names Travis already covers
      (`PROP_ID`, `OWNER_NAME`, `SITUS`, `STATE_CD`, `GIS_ACRES`,
      `MARKET_VALUE`), so the existing candidate lists should already match: —
      a real spot-check is still the right human follow-up. BCAD's `esearch.bcad.org`
      portal doesn't document a stable per-account deep-link scheme, so — same
      call as Harris County — `record()` links to the search page rather than
      guessing a URL shape that might 404. Bexar is a TX county, so it reuses
      the "TX counties don't zone" `zoning_note`. Verified in headless
      Chromium: `inBbox` correctly routes a downtown-San-Antonio point to the
      new source and correctly finds no source for an uncovered point (Denver);
      a real `analyze()` click at that point with a mocked ArcGIS response
      rendered parcel ID/owner/address/land-use/acreage/appraised-value
      correctly via the existing shared `showParcel` path; both pages still
      load with zero console/page errors.
- [ ] Share the pinned Compare list via URL. The permalink hash
      (`encodeHash`/`decodeHash` in `web/logic.js`) currently carries only the
      single clicked point; the Compare feature's pins (`localStorage`-backed,
      capped at 6) have no share/reload path of their own. Extending the hash
      (or a second `#compare=...` param) to carry the pinned points — decoded
      back into the compare list on load, same `applyHash()`-on-load pattern
      the single-site permalink already uses — would let someone share "here
      are the 3 sites I'm comparing" as one link instead of walking someone
      through re-pinning each site by hand.
- [x] **Nearest school's name in the residential_subdivision checklist.** The
      school-capacity leg of `maybeRenderResVerdict` counted nearby schools to
      estimate seat capacity but never surfaced which school(s) it was
      counting. `runDemand`'s competitor-scan query already resolves named,
      distance-sorted elements for every use (shared with the data_center
      substation scan) — that data just wasn't being kept for
      residential_subdivision. Stashed the nearest hit
      (`resState.nearestSchool = {name, km}`) alongside the existing
      `resState.schools` count, and added it to the verdict text (both PASS
      and SHORT read "nearest **Lakeview Elementary** (1.2 km)"-style, string
      omitted entirely in the capacity-unavailable state). Verified in
      headless Chromium: both pages load with zero console/page errors; a
      real end-to-end `analyze()` click with residential_subdivision selected
      renders the panel and sets `resState` without throwing; and driving
      `maybeRenderResVerdict` directly through PASS / SHORT / capacity-
      unavailable states with a mocked nearest-school produced the expected
      verdict text, CSS class, and correctly omitted the school name only in
      the unavailable state.

## Done
- [x] Two-lane UX (Explore vs Test a use) with a real CTA.
- [x] Live demand read + real "why no Costco here" verdict (rooftops vs threshold).
- [x] Parcel identification (boundary + county record) with projected-CRS fix.
- [x] Developer checklist (topography, MUD, zoning, entitlements, availability).
- [x] Base-map switcher + TCAD parcel overlay + listing deep-links.
- [x] GitHub Pages auto-deploy from `main`.
