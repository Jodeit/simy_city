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
- [x] **Reverse search, step 1: pure grid-scan/ranking engine.** Added
      `sampleGrid(center, radiusM, spacingM)` to `web/logic.js` — covers a
      disc around `center` with a square grid at `spacingM` spacing (local
      flat-earth offset math, same documented approximation style as
      `sampleTradeAreaPoints`), keeping only points within `radiusM`;
      hard-capped at 150 points via an evenly-strided subsample (not a
      truncation) so a too-fine spacing/too-large radius combo still covers
      the whole disc, just more sparsely, instead of exploding into hundreds
      of per-point candidates. And `rankCandidates(points, competitors,
      demandPoints, opts)` — for each grid point, reuses the existing
      `haversine()` helper for distance to the nearest `competitors` entry
      and a count of `demandPoints` within `opts.demandRadiusM`, combines
      those into a score (`opts.preferFar` rewards distance from
      competitors, `opts.preferNear` rewards demand proximity — both can be
      on at once, which is what the food-truck-court example wants: far
      from competitors, near residential), and returns the top `opts.limit`
      (default 6) points sorted best-first, non-mutating, same "pure
      transform, new array out" style as `sortPins`/`cheapest`. A point with
      zero nearby competitors scores as maximally far rather than being
      excluded. No network, no map, no UI in this item — just the scoring
      primitives. Added 15 new unit tests covering: radius containment,
      center-point inclusion, zero-radius edge case, the 150-point cap under
      a huge-radius/tiny-spacing combo, missing/invalid center; empty
      competitors/demand lists (score ties, no throw), a point exactly at a
      competitor (distance-0 handling, not null), tie-order stability,
      `preferFar` vs `preferNear` producing different top results on the
      same synthetic data, no-competitors-scores-maximally-far,
      demand-radius filtering, the `opts.limit`/default-6 behavior,
      non-mutation of the input array, and missing
      competitors/demandPoints/opts arguments. Verified: `python -m pytest -q`
      (15 passed), `simy validate` (OK), `node --test tests/js/*.test.mjs`
      (125 passed, 15 new), and headless Chromium confirms both
      `web/explore.html` and `web/index.html` still load with zero genuine
      console/page errors (this item touches only `web/logic.js`/tests, no
      HTML/UI wiring, so no page-load behavior changed). This unblocks the
      next two reverse-search steps (a `food_truck_court` land use, then the
      actual search UI) without touching the live map yet.
- [x] **Reverse search, step 2: a "far from X, near Y" land use to search
      for.** Added a 5th land use, `food_truck_court` (label "Food Truck
      Court / Mobile Vending Site"), to `data_sources/layers.yaml` —
      `requires.demand` reuses the familiar nearby-rooftop read but at a much
      tighter radius (1.2 km vs. fast_casual's 6 km — a food-truck court
      draws a walk/short-drive crowd, not a citywide one),
      `requires.parcel.min_buildable_acres: 0.25` (a paved lot, not a
      building), and a **new** `requires.competition` shape:
      `min_distance_km_from_nearest: 1.0` on existing restaurants/food
      vendors (`amenity=fast_food|restaurant`) — inverting the usual "avoid
      zero, allow crowding" competition read into "the *farther* the
      better," the same read `rankCandidates`'s `preferFar` scoring
      (step 1) already gives a zero-competitor point. `competition` was
      already a registered layer and `simy_city/registry.py`'s validator
      only checks that `requires` keys name a known layer id, not a specific
      field shape, so this needed no Python validator changes — confirmed
      `simy validate` passes with 5 land uses and no new errors. Wired up
      the single-point verdict in `web/explore.html`
      (`maybeRenderFTCVerdict`, `ftcState`), same wait-for-all-legs pattern
      as the other four `maybeRender*Verdict` functions (rooftop leg +
      acreage leg + competitor-distance leg from the existing
      `runDemand`/`showParcel` fan-out, no new network calls): PASS needs
      enough nearby rooftops *and* a big-enough parcel *and* the nearest
      food vendor at or beyond 1 km (or none in range at all, which reads as
      the best case, not a data gap). Verified in headless Chromium: both
      pages load with zero console/page errors; a real simulated map click
      with `food_truck_court` selected renders the full result panel
      end-to-end without throwing; and driving `maybeRenderFTCVerdict`
      directly through PASS / SHORT-on-demand / SHORT-on-site-size /
      SHORT-on-competitor-too-close / no-competitor-in-range (passes) /
      acreage-unavailable / no-rooftop-read / wrong-use-selected states all
      produced correct verdict text and CSS classes with zero throws. This
      unblocks reverse-search step 3 (the actual area-search UI), since the
      use it's meant to search for now has a real verdict of its own.
- [x] **Reverse search, step 3: the "🔍 Find candidate sites" search UI.**
      Wired steps 1–2 into an actual area search. Added a "🔍 Find candidate
      sites" button to the use-selector card (`web/explore.html`, visible
      whenever a use is selected in Test-a-use mode) that expands a small
      panel: a radius `<select>` (0.5x/1x/2x the current use's own
      `USE_DEMAND[current].radius` trade-area, so the choices scale
      correctly whether the use is food_truck_court's 1.2 km or warehouse_club's
      15 km) and a "Search here" button that takes the current **map center**
      as the search center (so re-centering via the existing address search
      box before searching just works, no extra wiring needed). On submit:
      exactly **one** Overpass query for rooftops in the search radius and
      **one** for competitors (reusing the per-use `compQ` already defined in
      `USE_DEMAND`) — never one query per candidate grid point — then
      `sampleGrid` + `rankCandidates` (step 1) do all the per-point scoring
      locally from those two already-fetched result sets. Added a new pure
      `reverseSearchSignals(requires, roofNeed)` to `web/logic.js` that
      decides which of `rankCandidates`' two signals apply to the *current*
      use from its model.json `requires` block: `preferFar` turns on for a
      "farther is better" competition read
      (`requires.competition.min_distance_km_from_nearest`, today only
      food_truck_court's inverted saturation check from step 2), `preferNear`
      turns on for any use with a rooftop-demand threshold (warehouse_club,
      fast_casual, food_truck_court). A use with neither signal (data_center,
      residential_subdivision) has no ranking signal yet, so the search
      button is disabled with an explanatory title rather than letting
      someone run a search that can only ever tie every candidate at score 0.
      Also added `parseOverpassPoints(json)` to `web/logic.js` (shared
      element-shape parsing — nodes carry lat/lon directly, ways/relations
      carry a `center` object instead — same handling the single-point
      competitor scan already did inline) so both area queries parse the
      same way. Results render as numbered blue circular markers distinct
      from the single-parcel marker/pin/probe-dot colors already in use,
      each with a one-line "why" (e.g. "≈12 rooftops within 1.2 km · nearest
      food vendor 1.6 km away") in both a map popup and a matching list row
      in the side panel; clicking either a marker or its list row runs the
      existing single-point `analyze()` flow, so a candidate flows straight
      into the normal parcel/checklist read. Capped at 8 results; an empty
      grid (degenerate center) shows a clear "no candidates matched — try a
      larger radius" state instead of silently rendering nothing, and a
      total Overpass failure (both queries unreachable) shows a distinct
      "couldn't reach OpenStreetMap" state rather than a fake empty result.
      Uses its own `searchReqSeq` counter (not the single-point flow's
      `reqSeq`) so a reverse search in flight and a map click in flight can't
      invalidate each other. Added 11 new unit tests for
      `parseOverpassPoints`/`reverseSearchSignals` (node/way/relation element
      shapes, missing-coords elements, a real `0,0` coordinate kept rather
      than treated as missing, malformed responses, each signal
      independently, both on at once, both off, missing `requires`/
      `competition`). Verified in headless Chromium: both pages load with
      zero console/page errors beyond the expected sandbox-blocked
      `ERR_TUNNEL_CONNECTION_FAILED` network errors; selecting
      food_truck_court enables the search button with the correct 0.6/1.2/2 km
      radius options, while selecting data_center correctly disables it and
      closes the panel; running a real search end-to-end with a mocked
      `overpassRaw` produced 8 ranked candidate markers/rows with correct
      "why" text, clicking a result row ran a real `analyze()` (result panel
      rendered) with zero console errors; an all-empty mocked response
      rendered the "no candidates matched" state; a rejected mocked response
      rendered the "couldn't reach OpenStreetMap" state; and switching back
      to Explore mode correctly closed the panel and removed the candidate
      markers. Outbound network to Overpass is blocked from this sandbox, so
      a live end-to-end area search on the real site is a good human
      spot-check.
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

## Next (breadth) — newly added
- [x] **Paste raw coordinates into the address search box.** `wireAddrSearch()`
      in `web/explore.html` previously always called Nominatim, even when the
      query was already a `lat, lng` pair (something people commonly paste
      straight from Google Maps or a GPS app). Added a pure `parseCoordPair(q)`
      helper to `web/logic.js` (matches a plain `-?digits(.digits)?, -?digits(.digits)?`
      shape, range-checks `-90..90`/`-180..180`, returns `{lat,lng}` or `null`)
      and short-circuit before the fetch in `wireAddrSearch()`: on a match,
      skip Nominatim entirely and jump straight to `map.setView` + `analyze()`,
      same as a real geocoder hit. Address-shaped strings with a comma (e.g.
      "123 Main St, Austin, TX") correctly fall through to the normal
      geocoder search since they don't match the coordinate-pair regex. Added
      8 new unit tests (with/without space after the comma, integer
      coordinates, out-of-range lat/lng in all four directions, address
      strings, empty/non-string/malformed input). Verified in headless
      Chromium: both pages load with zero console/page errors; filling the
      address box with `"30.2672, -97.7431"` and submitting the form set
      `lastLatLng` to the parsed point and ran a real `analyze()` end to end
      (result panel rendered) with zero console/page errors, without ever
      hitting the Nominatim fetch path.
- [x] **Live `hashchange` re-apply for shared/pinned links.** `applyHash()`
      (`web/explore.html`) previously only ran once, on initial page load.
      Added `window.addEventListener("hashchange", applyHash)` so a
      same-document navigation to a new `#mode=…`/`#cmp=…` hash — e.g.
      pasting a fresh permalink into the address bar of an already-open tab —
      now re-applies it. Confirmed this is safe to call mid-session: `writeHash()`
      (called from every `analyze()`) uses `history.replaceState`, which never
      fires `hashchange` itself, so there's no feedback loop between a click
      and the new listener; and both the Compare-pin merge
      (`mergeComparePins`) and the recently-viewed record (`addRecentSite`)
      already dedupe by rounded lat/lng, so re-applying the same hash moves
      the existing entry to the front instead of duplicating it. Verified in
      headless Chromium: both pages load with zero console/page errors;
      firing a synthetic same-document `hashchange` to a fresh
      `#mode=build&use=data_center&lat=..&lng=..` (never visited at load)
      switched mode/use, ran a real `analyze()`, and added one recently-viewed
      entry; re-applying the identical hash added zero new entries (dedup
      holds); and changing to a genuinely different point via a second
      `hashchange` navigated again and added a second distinct entry — all
      with zero console/page errors (network calls to Overpass/ArcGIS
      correctly fail-and-degrade in this sandbox, as expected).
- [x] **Dark mode toggle.** Added a manual light/dark toggle to
      `web/explore.html` — a 🌙/☀️ button in the header, persisted to
      `localStorage` (`simy_theme`), defaulting to the browser's
      `prefers-color-scheme` when no explicit choice has been made yet. Moved
      the panel/map-overlay/modal colors (previously hard-coded hex) onto CSS
      custom properties (`--ink`, `--slate`, `--paper`, `--line`, `--card`,
      plus new `--surface`/`--contested-*`/`--aligned-*`/`--danger-*`/
      `--leanbar-*`/`--overlay-bg`/`--modal-backdrop`/`--shadow-*`) and added
      a `:root[data-theme="dark"]` override block; a tiny inline script in
      `<head>` (before the stylesheet/style block) reads the saved choice or
      `matchMedia("(prefers-color-scheme: dark)")` and sets the `data-theme`
      attribute before first paint, avoiding a flash of the wrong theme. The
      always-dark header/mode-switch chrome (already dark in the light theme,
      by design) and the small per-perspective JS marker/chip colors are
      unchanged in both themes — only the light-in-light-mode panel surfaces
      needed a dark counterpart. Computed contrast ratios for every new dark
      pairing (body text, secondary text, links, contested/aligned/danger
      verdict text-on-background) — all clear 4.5:1 AA, several 7-15:1 (same
      rigor as the earlier light-theme accessibility pass, which found the
      original amber text at only 5.9:1 — a naive inverted dark palette is
      not guaranteed to pass and didn't get a free pass here either).
      `web/index.html` (the marketing landing page) was left light-only —
      out of scope for this pass; a natural follow-up if wanted. Verified in
      headless Chromium: both pages load with zero genuine JS errors (only
      the expected sandbox-blocked `ERR_TUNNEL_CONNECTION_FAILED` network
      errors, same as every prior run); forcing `simy_theme=dark` via
      `localStorage` before load correctly set `data-theme="dark"` and
      rendered the dark panel background/text colors (confirmed via
      `getComputedStyle`); and clicking the toggle button live flipped
      `data-theme`, updated the icon/`aria-pressed`, and persisted the new
      choice to `localStorage`, all with zero console errors.

## Next (breadth) — newly added (2)
- [x] **Dark mode for the landing page.** Extended `web/explore.html`'s
      light/dark pattern to `web/index.html`: moved `:root`'s light-surface
      colors (`--ink`, `--paper`, `--card`, `--slate`, `--line`,
      `--garden-deep`, plus new `--tint-bg`/`--garden-grad-1`/`--garden-grad-2`
      introduced to de-hardcode the four `#eef3ec` chip backgrounds and the
      `.garden` section gradient) onto custom properties, added a
      `:root[data-theme="dark"]` override block reusing explore.html's
      already-vetted dark palette verbatim, and reused the same
      before-first-paint inline script and `simy_theme` `localStorage` key so
      a visitor's choice carries over between the two pages. Added a matching
      🌙/☀️ toggle button to the nav. The hero and mission sections are
      already dark-on-light-text by design (same exemption explore.html's
      header/mode-switch chrome got) and needed no change. The "How it works"
      dependency-diagram SVGs needed their own fix: the `REQUIRES`/`INDUCES`
      labels, loop captions, and connector-arrow strokes were hardcoded
      `#5b6b6a`/`#1f7a33` sitting directly on the panel background — switched
      those to `fill="var(--slate)"`/`var(--garden-deep)` so they don't go
      low-contrast against a darkened panel; the small colored accent chips
      (Power/Water/Fiber, Fire/Grid/Roads) keep their fixed light backgrounds
      on purpose, since their saturated text colors are tuned for a light
      chip and swapping to a dark chip bg would tank that contrast instead of
      improving it. Computed contrast ratios for every new dark pairing via
      real rendered `getComputedStyle` values in headless Chromium (not just
      hand math): body text 15.4:1, secondary/`.sub` text 8.1:1, links
      9.3:1, code/tag chips on `--tint-bg` 7.1–8.2:1 — all clear AA, most
      clear AAA. Verified in headless Chromium: both pages load with zero
      console/page errors; the toggle flips `data-theme`, updates the
      icon/`aria-pressed`, and persists to `localStorage` on both pages;
      cold-loading with `simy_theme=dark` pre-set correctly renders dark from
      first paint (no flash); and a pixel screenshot of light mode after this
      change is unchanged from before it. `index.html` badge-icon circles and
      the SVG accent chips mentioned above were left with their original
      colors — a design choice, not an oversight.
- [x] **One more parcel county.** Added King County, WA (Seattle) as a 6th
      `PARCEL_SOURCES` entry — `gismaps.kingcounty.gov`'s
      `Property/KingCo_Parcels/MapServer/0` (found via web search since this
      sandbox's egress policy blocks direct ArcGIS REST introspection, same
      constraint every prior county hit). Confirmed via search-indexed docs
      that the public layer's only usable field is `PIN` (the 10-digit
      Parcel ID, `MAJOR`+`MINOR` concatenated) — added `"PIN"` to the shared
      `pick()` id candidate list. Owner name and situs address are withheld
      from King County's public REST layers by Washington state law, and
      land use/acreage/appraised value live in the county's separate,
      non-GIS Assessor roll — left unmapped rather than guessing a field name
      that isn't actually there, same graceful partial-field-coverage LA
      County already established (that one at least had address/land-use;
      King County's public boundary layer is PIN + geometry only). No
      documented per-PIN deep-link URL scheme either, so — same call as
      Harris/Bexar/LA — `record()` links to the Assessor's own eMap search
      (`info.kingcounty.gov/assessor/emap/`) rather than guessing a link
      shape that might 404. WA counties, like AZ/CA, do zone unincorporated
      land (unlike the TX counties already covered), so this needed its own
      `zoning_note`. Verified in headless Chromium: `inBbox` correctly routes
      a downtown-Seattle point to the new source and still finds no source
      for an out-of-coverage point (Denver); driving `showParcel` directly
      with a mocked King-County-shaped ArcGIS attribute payload (`PIN`-only)
      rendered the parcel ID, the new WA zoning note, and the eMap record
      link correctly; an empty-attributes edge case rendered without
      throwing; and both pages still load with zero genuine console/page
      errors (only the expected sandbox-blocked `ERR_TUNNEL_CONNECTION_FAILED`
      for the live tile/GIS hosts). Live endpoint reachability and the exact
      `PIN` field name/format couldn't be confirmed from this sandbox — a
      live spot-check is a good human follow-up, same as every prior county.
      of the new source is a good human follow-up, same as every prior county.
- [x] **Respect `prefers-reduced-motion` for the loading-pulse animation.**
      The `.loading` class (`web/explore.html`) used an infinite `@keyframes
      pulse` opacity animation while parcel/topo/MUD/census reads are
      in-flight, unconditionally. Moved the `animation` declaration off the
      base `.loading` rule and into a `@media (prefers-reduced-motion:
      no-preference)` block, so people who've asked their OS to minimize
      motion get a static (non-pulsing, still legible via its existing
      italic/grey styling) loading indicator instead — same accessibility
      rigor as the earlier keyboard/ARIA/contrast pass. `web/index.html`'s
      decorative `dash`/`spin` SVG-diagram animations are a separate,
      pre-existing case (not part of this backlog item's `.loading` scope)
      and were left as a follow-up if wanted. Verified in headless Chromium:
      both pages load with zero console/page errors; with
      `page.emulateMedia({reducedMotion: 'no-preference'})` a fresh
      `.loading` element's computed `animationName` is `pulse` (unchanged
      behavior), and with `{reducedMotion: 'reduce'}` it's `none` (animation
      correctly suppressed).

## Next (breadth) — newly added (3)
- [x] **Sortable Compare-parcels table.** The "⚖️ Compare" modal's table
      (pinned parcels, address/owner/acreage/appraised value/land use/county)
      always rendered in pin order. Compare's table is transposed (fields as
      rows, pins as columns), so "sortable columns" became clickable *row
      labels* for the two numeric fields (Acreage, Appraised value) instead
      of `<th>` column headers — clicking re-sorts the pinned list and
      re-renders; a second click on the same label flips direction (▲/▼
      indicator, `aria-pressed`). Added a pure `sortPins(pins, key, dir)`
      helper to `web/logic.js` (numeric-aware, non-mutating; a pin missing
      the sort field always sorts last regardless of direction rather than
      landing first on a "desc" sort) with 7 new unit tests (ascending,
      descending, missing-value-sorts-last in both directions, default
      direction, all-missing list, non-mutation, null/undefined list). The
      per-row "✕" remove button now keys off `pins.indexOf(p)` on the sorted
      view rather than the display index, so removing a pin while a
      non-default sort is active still removes the correct underlying pin.
      No network involved — pure client-side reordering of already-resolved
      snapshots. Verified in headless Chromium: both pages load with zero
      genuine console/page errors (only the expected sandbox-blocked
      `ERR_TUNNEL_CONNECTION_FAILED` network errors); seeding three pins
      with mixed/missing acreage and appraised-value data and driving the
      real Compare-open + sort-button clicks end to end produced correct
      ascending/descending orders for both fields, correctly sorted the
      null-value pin last on an ascending sort, and confirmed the ✕ button's
      target still mapped to the correct pin after sorting.
- [x] **Keyboard-shortcuts help overlay.** The accessibility pass already made
      path cards, mode/use toggles, and modals fully keyboard-operable, but
      there was no in-app way to discover this. Added a "❓" header button and
      a small help modal (reusing the existing `openModal()`/`closeModal()`
      focus-trap pair, so Escape/backdrop-click/Tab-trap all come for free)
      listing the actual shortcuts: Tab to move between controls, Enter/Space
      to activate a focused path card or toggle, Escape to close a dialog,
      and `?` to open this one. The `?` key is wired globally but ignored
      while another modal is already open or while focus is in a text
      input/textarea/select/contenteditable (so typing a literal "?" into
      the address-search box doesn't hijack it). Verified in headless
      Chromium: both pages load with zero console/page errors; clicking the
      "❓" button opens the modal with focus moved inside; Escape closes it
      and returns focus to the button; pressing `?` anywhere on the page
      opens it; pressing `?` while focused in the address-search input does
      *not* open it; the Close button closes it; and Tab keeps focus
      trapped inside the modal (only its Close button is focusable).
- [x] **Undo for "clear all recently-viewed".** The recently-viewed list's
      "clear all" link used to wipe `localStorage` immediately with no
      confirmation or recovery. Added a pure `clearRecentSites(list)` /
      `undoClear(saved,clearedAt,now,windowMs)` pair to `web/logic.js` —
      `clearRecentSites` returns the empty list a "clear" click should
      persist (the caller snapshots what it's replacing, since there's
      nothing left to snapshot once this returns); `undoClear` takes
      `now`/`clearedAt` as plain arguments rather than reading `Date.now()`
      internally, so the expiry check stays pure and testable without
      mocking the clock, returning `null` (not the stale list) once
      `windowMs` (default 8000) has elapsed. Wired into `web/explore.html`'s
      recently-viewed panel: clicking "clear" now shows an inline
      "Cleared — Undo" affordance in place of the clear link for 8s (real
      `setTimeout`, not just the pure-function math) — clicking "Undo"
      restores the exact snapshot and re-persists it; letting the window
      elapse (or recording a fresh site in the meantime, which would
      otherwise silently drop that new entry on an undo) retires the offer
      and reveals "clear" again. Added 8 new unit tests (`clearRecentSites`
      on a populated/empty list, non-mutation, restore-exact-list — same
      array reference — within the window, past-the-window returns null,
      right-at-the-boundary still restores, default-window behavior,
      nothing-saved returns null). Verified in headless Chromium: both pages
      load with zero console/page errors; driving the real
      clear→undo→localStorage round trip end to end restored the exact
      2-entry list; and a real (not simulated) 8.3s wait past a "clear"
      click auto-hid the undo affordance, restored the "clear" link, and
      correctly re-hid the (now-empty) recently-viewed strip — the full
      timer-driven UI path, not just the pure function in isolation.

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
- [x] **Share the pinned Compare list via URL.** Added a standalone `cmp=`
      hash segment (`encodeComparePins`/`decodeComparePins` in `web/logic.js`)
      alongside the existing single-point `mode=/use=/lat=/lng=` permalink —
      kept separate rather than merged into `encodeHash`, since the clicked
      point and the Compare list are independent things to share. Packs only
      the fields `renderCompare()` displays (label, owner, acreage, value,
      land use, county, tested use, verdict — not raw parcel attrs), capped
      at 6 pins, URI-encoded JSON. A new "🔗 Share list" button in the
      Compare modal copies `location.href` + the encoded segment (`copy()`
      generalized to take a target status-element id so the modal gets its
      own feedback message instead of the toolbar's `toolMsg`, which doesn't
      exist inside the modal). On load, `applyHash()` decodes any `cmp=`
      segment and folds it into the existing `pins` via `mergeComparePins`
      (same rounded-lat/lng dedupe `addPin()` uses, capped at 6) — so opening
      a shared link *adds* to whatever's already pinned locally instead of
      replacing it, and re-persists to `localStorage` via `savePins()`.
      Updated the Compare modal's privacy note, since pins now *can* leave
      the device — but only when a person explicitly clicks Share, never
      automatically. Added 10 new unit tests (encode/decode round trip,
      6-pin cap, missing-field defaults, malformed/absent hash, dropping
      rows without valid lat/lng, coexistence with the point hash, merge
      dedup/cap/non-mutation). Verified in headless Chromium: both pages
      still load with zero console/page errors; seeded `localStorage` pins,
      reloaded, clicked the real Share-list button end to end and confirmed
      the copied link round-trips through decode/merge correctly; and — the
      scenario that actually matters — opened a real `#cmp=...` link as a
      **fresh navigation** (both into an empty-pins browser and into one with
      a pin of its own already saved) and confirmed `applyHash()` populates/
      merges `pins` and `localStorage` correctly with zero errors. Note:
      like the pre-existing single-point permalink, this only fires on an
      actual page load — `explore.html` has no `hashchange` listener, so
      navigating to a same-document hash-only URL (e.g. via `history.
      pushState`) won't re-trigger it; a real "open this link" (new tab,
      pasted URL, clicked from chat/email) always does.
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
- [x] **CSV export for the Compare list.** Added a "⬇️ Download CSV" button
      next to the existing "🔗 Share list" button in the Compare modal,
      exporting the same rows `renderCompare()` already shows (site, owner,
      acreage, appraised value, land use, county, and — in Test-a-use —
      use/verdict) as a downloaded `.csv` via a `Blob` + anchor click, same
      client-side-only pattern as the existing PNG "make the case" image
      export — no network call at all. Added pure `toCsvField`/`toCsvRow`/
      `toCsv` helpers to `web/logic.js` implementing RFC-4180 quoting (a field
      is wrapped in double quotes, with embedded quotes doubled, whenever it
      contains a comma, a double quote, or a newline — owner names and
      addresses routinely have commas), CRLF row joins, and null/undefined
      fields rendered as empty rather than the literal "null"/"undefined".
      Added 9 new unit tests covering the escaping edge cases and a full
      multi-row round-trip. Verified in headless Chromium: both pages load
      with zero console/page errors; seeded two pins (one with a
      comma-containing owner name and a comma-containing fallback
      lat/lng label, one all-nulls) and drove the real `downloadCompareCsv()`
      end to end (Blob → anchor click, mocked to confirm the click fires
      without an actual filesystem write) — produced exactly the expected
      quoted CSV text with zero console errors.
- [x] **Recently-viewed sites (session history).** Added an automatic MRU
      list (cap 6, most-recent-first) of every point `analyze()` resolved,
      distinct from the explicit "📌 Pin to compare" list — no user action
      needed. A new `setLastParcelSummary()` wrapper is the one place all
      four `lastParcelSummary` assignments (no-parcel-source, no-parcel-here,
      network-failure, and the fully-resolved case) funnel through, so
      recording happens regardless of how much data actually resolved for a
      given click — same snapshot shape Compare pins already read, no extra
      network calls. Added a pure `addRecentSite` helper to `web/logic.js`
      (moves a re-visited point, same rounded-lat/lng dedupe `addPin()`/
      `mergeComparePins()` use, to the front instead of duplicating it; caps
      and drops the oldest) with 6 new unit tests, persisted to `localStorage`
      under its own key, and rendered as a collapsible "Recently viewed"
      `<details>` strip above the result panel — hidden entirely until the
      first site is viewed. Clicking an entry re-navigates the map the same
      way a Compare row's site-name link already does. Verified in headless
      Chromium: both pages load with zero console/page errors; the strip
      stays hidden with no history; `addRecentSite` driven directly in-page
      confirmed MRU ordering and revisit-dedupe; and a real simulated map
      click populated the strip end to end (`recent.length` went to 1,
      persisted to `localStorage`) even with outbound network blocked in
      this sandbox (the no-parcel-resolved case still records lat/lng), and
      clicking the resulting link re-triggered `analyze()` without throwing.
- [x] **One more parcel county.** Added Los Angeles County, CA as a 5th
      `PARCEL_SOURCES` entry — `public.gis.lacounty.gov`'s
      `LACounty_Cache/LACounty_Parcel/MapServer/0` (found via web search since
      this sandbox can't reach ArcGIS hosts to introspect field names
      directly; search results independently confirmed the field list —
      `AIN`, `SitusFullAddress`, `UseType` — from the layer's own published
      schema). Added those three names to the shared `pick()` id/address/
      land-use candidate lists. The public layer doesn't expose owner name,
      acreage, or assessed value (those live in the separate non-GIS Assessor
      roll, not the parcel-boundary GIS layer) — left unmapped rather than
      guessing a wrong field, same graceful partial-field-coverage every
      other county already degrades to; in particular the layer's only area
      field, `Shape.STArea()`, is square feet, not acres, and `pick()` does
      no unit conversion, so mapping it to the acreage row would've rendered
      a bogus "12000.00 ac" — left out on purpose. LA County's Assessor
      portal doesn't document a stable per-AIN deep-link scheme either, so —
      same call as Harris/Bexar — `record()` links to the portal's search
      page rather than guessing a URL shape that might 404. Unlike the TX
      counties already covered, CA counties do zone unincorporated land, so
      this is the first non-"TX counties don't zone" `zoning_note`. Verified
      in headless Chromium: both pages load with zero real JS errors;
      `inBbox` correctly routes a downtown-LA point to the new source and
      still finds no source for an out-of-coverage point (Denver); driving
      `showParcel` directly with a mocked LA-shaped ArcGIS attribute payload
      (`AIN`/`SitusFullAddress`/`UseType`) rendered the parcel ID/address/
      land-use rows, the new CA zoning note, and the record link correctly;
      and a real simulated map click at that point with `warehouse_club`
      selected ran the whole fan-out (parcel + demand) without throwing,
      degrading to "couldn't reach the county parcel service" since outbound
      network to `*.gis.lacounty.gov` is blocked from this sandbox — a live
      spot-check on the real site (actual field values, portal link) is a
      good human follow-up, same as every prior county addition.

- [x] **Respect `prefers-reduced-motion` on the landing page's decorative SVG
      animations.** The earlier reduced-motion pass covered `web/explore.html`'s
      `.loading` pulse but explicitly scoped out `web/index.html`'s "How it
      works" dependency-diagram SVGs: `.dash` (`stroke-dasharray` marching-ants,
      `@keyframes dash`, 1.4s infinite) and `.spin` (`@keyframes spin`, 26s
      infinite rotation). Moved both `animation` declarations off the base
      `.dash`/`.spin` rules and into a `@media (prefers-reduced-motion:
      no-preference)` block — same pattern already used for explore.html's
      `.loading` pulse — so the diagrams render as static (still legible; the
      arrows/loop shape don't depend on the animation) for visitors who've
      asked their OS to minimize motion. Verified in headless Chromium: both
      pages load with zero console/page errors; with
      `page.emulateMedia({reducedMotion:'reduce'})`, a `.dash`/`.spin`
      element's computed `animationName` is `none`, and with
      `{reducedMotion:'no-preference'}` it's `dash`/`spin` (unchanged
      behavior) — same assertion shape as the earlier explore.html check.
- [x] **One more parcel county.** Added Cook County, IL (Chicago) as a 7th
      `PARCEL_SOURCES` entry — `gis.cookcountyil.gov`'s public
      `CookViewer3Parcels/MapServer/0` (found via web search since this
      sandbox can't reach ArcGIS hosts directly to introspect schemas; search
      results consistently confirmed the layer's field list —
      `PIN10`/`PIN14_dash`/`street_address` — across multiple independent
      hits). Added those field names to the shared `pick()` id/address
      candidate lists. Unlike Harris/Bexar/LA/King (no documented per-parcel
      deep-link, so those fall back to a search page), the Cook County
      Assessor *does* publish a stable per-PIN URL
      (`cookcountyassessoril.gov/pin/<14-digit PIN, no dashes>`), confirmed
      live via search — so `record()` strips the dashes from `PIN14_dash`
      (falling back to `PIN10`/`PIN`) and builds a real deep link instead of
      guessing. The public layer doesn't expose owner name, land use,
      acreage, or appraised value (those live in the county's separate,
      non-GIS Assessor roll) — left unmapped rather than guessing a field
      that isn't actually there, same graceful partial-field-coverage every
      other thin-layer county (King) already established. Illinois counties
      do zone unincorporated land (unlike TX, like AZ/CA/WA), so this needed
      its own `zoning_note`. Verified in headless Chromium: both pages load
      with zero console/page errors; `inBbox` correctly routes a
      downtown-Chicago point to the new source and still finds no source for
      an out-of-coverage point (Denver); `record()` was driven directly
      through a dashed-`PIN14_dash` payload, a `PIN10`-only payload, and an
      empty-attributes payload, producing the correct per-PIN deep link (or
      search-page fallback) each time; `showParcel` was driven end-to-end
      (via a real `analyze()` call building the panel first, then a mocked
      Cook-County-shaped ArcGIS attribute payload) and rendered the parcel ID,
      address, new IL zoning note, and record link correctly; and a real
      simulated map click at that point with `warehouse_club` selected ran
      the whole fan-out (parcel + demand) without throwing, degrading to
      "couldn't reach the county parcel service" since outbound network to
      `gis.cookcountyil.gov` is blocked from this sandbox — a live
      spot-check on the real site (actual field values, PIN URL format) is a
      good human follow-up, same as every prior county addition.
- [x] **Let people clear or remove individual recently-viewed sites.** The
      "Recently viewed" strip (`web/explore.html`, `recent`/`renderRecent`/
      `recordRecent`, `RECENT_KEY="simy_recent_v1"`) only ever grew (capped
      at 6, oldest evicted) — there was no way to remove an entry short of
      clearing `localStorage` from devtools, unlike the Compare-pins list
      which already has a per-row "✕" remove button and a "clear all". Added
      the same affordance here: a pure `removeRecentSite(list, i)` helper in
      `web/logic.js` (out-of-range/negative index no-ops rather than
      throwing, mirrors `addRecentSite`'s style), a small "✕" per
      `recentList` row (`removeRecent()` wired through `renderRecent()`,
      same `savePins()`-style re-render-and-persist pattern as
      `removePin()`), and a "clear" link on the strip that empties the whole
      list. Added 6 new unit tests for `removeRecentSite` (remove by index,
      remove-first shifts correctly, out-of-range and negative indices
      no-op, null/undefined list handled, no in-place mutation). Verified in
      headless Chromium: both pages load with zero console/page errors;
      seeded two recent sites via `localStorage`, reloaded, clicked the
      first row's ✕ end-to-end and confirmed exactly one entry remained in
      both the DOM and `localStorage`; clicking "clear" then emptied the
      strip (hidden) and `localStorage`; and driving `removeRecentSite`
      directly in-page with an out-of-range index confirmed the no-op.

## Next (breadth) — newly added (4)
- [x] **6th land use: EV charging hub.** Added `ev_charging_hub` (label
      "EV Charging Hub") to `data_sources/layers.yaml`: `requires.power`
      reuses `data_center`'s `prefer_substation_within_km` shape at 3 km
      (vs. data_center's 5 km — meaningful nearby grid capacity, not a
      dedicated substation upgrade), `requires.demand` reads nearby total
      rooftops as a documented imperfect proxy for "people who can't charge
      at home" (same call `food_truck_court` already made — Overpass can't
      reliably filter to `building=apartments`), and a new
      `requires.competition.min_distance_km_from_nearest: 0.8` gate against
      existing chargers (`amenity=charging_station`, a standard, widely-used
      OSM tag) — same inverted "farther is better" read `food_truck_court`
      established. Confirmed `reverseSearchSignals` (`web/logic.js`) needed
      **no changes**: it already turns `preferFar` on for any
      `competition.min_distance_km_from_nearest` field and `preferNear` on
      for any `roofNeed`, so the reverse-search "🔍 Find candidate sites"
      button picks this use up automatically with both signals live.
      Wired the single-point verdict in `web/explore.html`
      (`maybeRenderEVVerdict`, `evState`, `EV_SUB_KM=3`/
      `EV_MIN_COMPETITOR_KM=0.8`), same wait-for-all-legs pattern as
      `maybeRenderFTCVerdict` — but 3 different legs (no acreage gate, since
      a charging hub is a handful of bays on an existing commercial lot, not
      a use with its own site-size check): rooftop demand (existing leg),
      a new power leg (`USE_DEMAND.ev_charging_hub.powerQ`, a dedicated
      substation-distance Overpass query added to `runDemand` since
      `compQ`'s position was already taken by the charger-competition
      query — same query shape data_center's siting check uses), and the
      charger-competition leg (farther-is-better, reusing the existing
      `compQ`/competitor-scan machinery). Added to the use-selector button
      order and both `analyze()`'s state-reset branches. Verified: `python -m
      pytest -q` (15 passed), `simy validate` (OK, 6 land uses), `node --test
      tests/js/*.test.mjs` (142 passed, all pre-existing — no new pure logic
      was needed since `reverseSearchSignals` already generalized), and
      headless Chromium confirms both `web/explore.html` and
      `web/index.html` load with zero console/page errors; selecting
      `ev_charging_hub` enables the reverse-search button with both
      `preferFar`/`preferNear` signals on; a real simulated map click with
      it selected runs the whole fan-out (parcel + rooftop + power leg +
      competitor leg) without throwing; and driving `maybeRenderEVVerdict`
      directly through PASS / SHORT-on-power / SHORT-on-competitor-too-close
      / no-competitor-in-range (passes) / no-rooftop-read (hides) /
      substation-unavailable / competitor-scan-unavailable / wrong-use
      (stale-seq no-op) states all produced correct verdict text and CSS
      classes with zero throws. Outbound network to Overpass is blocked from
      this sandbox, so a live end-to-end power/competitor fetch on the real
      site is a good human spot-check.
- [x] **One more parcel county: Miami-Dade County, FL.** Added Miami-Dade
      County, FL as an 8th `PARCEL_SOURCES` entry —
      `gisweb.miamidade.gov`'s `MD_LandInformation/MapServer/26` (found via
      web search since this sandbox can't reach ArcGIS hosts to introspect
      schemas directly, same discovery path every prior county followed;
      multiple independent search-indexed sources confirmed the field
      list). Added `FOLIO` (parcel id), `TRUE_OWNER1` (owner),
      `TRUE_SITE_ADDR` (address), `DOR_CODE_CUR` (FL Dept-of-Revenue land
      use code), and `TOTAL_VAL_CUR` (appraised value) to the shared
      `pick()` candidate lists. The layer's only area field, `LND_SQFOOT`,
      is square feet — same unit mismatch LA County's `Shape.STArea()` hit —
      so it was left unmapped rather than rendering a bogus "12000.00 ac"
      the way a naive `pick()` would, same graceful partial-field-coverage
      every thin-schema county already established. The Property
      Appraiser's search app (`apps.miamidadepa.gov/propertysearch`) is a
      client-rendered SPA with no documented per-folio deep-link URL, so —
      same call as Harris/Bexar/LA/King — `record()` links to the search
      page rather than guessing a URL shape that might 404. Florida
      counties zone unincorporated land (unlike TX, like AZ/CA/WA/IL), so
      this needed its own `zoning_note`. Verified in headless Chromium:
      `inBbox` correctly routes a downtown-Miami point to the new source
      and still finds no source for an out-of-coverage point (Denver); a
      real `analyze()` call built the panel, then `showParcel` was driven
      directly with a mocked Miami-Dade-shaped ArcGIS attribute payload and
      rendered the parcel ID/owner/address/land-use/appraised-value rows,
      the new FL zoning note, and the record link correctly; an
      empty-attributes edge case rendered without throwing; and both pages
      still load with zero genuine console/page errors (only the expected
      sandbox-blocked `ERR_TUNNEL_CONNECTION_FAILED` for the live GIS
      hosts). Live endpoint reachability and the exact field formats
      couldn't be confirmed from this sandbox — a live spot-check is a good
      human follow-up, same as every prior county.
- [x] **Printable single-parcel report.** Added a `@media print` stylesheet to
      `web/explore.html` that hides `header`, `#mapwrap`, `#useBar`,
      `#recentStrip`, `.toolbar` (the button row, including the collapsed
      "make the case" controls), and any open `.modal`, and lets `#panel`/
      `#result` lay out as a single unconstrained-height column (`overflow:
      visible`, no border). A new `<pre class="printCase">` element (sibling
      of `.toolbar`, so hiding `.toolbar` in print doesn't hide it) is filled
      with the exact same text `buildCaseText()`/`downloadCaseImage()` already
      assemble — reused verbatim, no new copy logic — and is `display:none`
      on screen but `display:block` (monospace, wrapped) in print, giving the
      printed page the full case narrative (stakeholder verdict, reasons,
      standoffs, requires) that isn't otherwise present as plain HTML in the
      panel. A "🖨️ Print report" button next to "Download image" in the
      Test-a-use "Make the case" row calls `window.print()`; no new network
      calls, no new persisted state. Scoped to Test-a-use mode only (same as
      the rest of the "make the case" tools) since Explore mode has no case
      text to print. Verified: `python -m pytest -q` (15 passed), `simy
      validate` (OK), `node --test tests/js/*.test.mjs` (142 passed, no new
      pure logic needed since this only reuses existing `buildCaseText`
      output), and headless Chromium confirms both pages load with zero
      console/page errors; a real simulated map click with `data_center`
      selected populates `#printCase` with the real case text; and
      `page.emulateMedia({media:'print'})` computes `header`/`#mapwrap`/
      `.toolbar` to `display:none` while `#panel`/`#result`/`.printCase`
      stay visible — a real print-preview render, not just a static CSS
      review.

## Next (breadth) — newly added (5)
- [x] **Bug fix: warehouse_club's reverse search ignored its own
      competition gate.** `reverseSearchSignals` (`web/logic.js`, added
      alongside the "🔍 Find candidate sites" search UI) only recognized the
      `requires.competition.min_distance_km_from_nearest` shape as a
      "farther is better" signal — food_truck_court's and ev_charging_hub's
      shape. warehouse_club's own competition gate
      (`max_same_brand_in_trade_area: 0`, `data_sources/layers.yaml`) uses a
      *different* field name for the exact same "avoid this competitor
      entirely" semantics, so it fell through unrecognized: the search
      button was enabled for warehouse_club (rooftop `roofNeed` alone turned
      `preferNear` on) and looked like a real "far from existing Costcos"
      search, but silently ranked on rooftop demand only — a misleading
      result, not a crash, which is why it slipped through the original
      session's verification. (A pre-existing unit test even encoded this
      gap: `reverseSearchSignals: a use with neither (e.g. data_center) gets
      both signals off` passed `{ competition: { max_same_brand_in_trade_area:
      0 } }` — warehouse_club's actual shape, not data_center's — and
      asserted `preferFar: false`, which the fixed test would now fail.)
      Extended `reverseSearchSignals` to also turn `preferFar` on for
      `max_same_brand_in_trade_area!=null`. Fixed the mislabeled test (now a
      correct data_center-shaped `{}` case) and added a new one asserting
      `max_same_brand_in_trade_area` turns `preferFar` on. Verified:
      `python -m pytest -q` (15 passed), `simy validate` (OK, 6 land uses),
      `node --test tests/js/*.test.mjs` (143 passed, 1 new), and headless
      Chromium: both pages load with zero console/page errors; selecting
      `warehouse_club` now reports `{preferFar:true, preferNear:true}` from
      `reverseSearchSignals` (previously `preferFar:false`); and running
      `runCandidateSearch()` with mocked `overpassRaw` (synthetic rooftops +
      a synthetic competing warehouse club) produced result text like
      "≈2 rooftops within 15 km · nearest warehouse club 15.9 km away" —
      the competitor clause that was previously always missing for this use
      — with markers rendered and zero console errors.
- [x] **Reverse search: let a shared/pinned search's radius+use travel in the
      URL.** The single-point permalink (`encodeHash`) and the Compare-pins
      list (`cmp=`) are both shareable via URL; the area search
      (`searchRadius`/`runCandidateSearch`, step 3) wasn't — reopening a
      shared link always started from the default map center/radius for
      whatever use is selected. Added `encodeSearchHash(lat,lng,radiusM,use)`/
      `decodeSearchHash(hash)` to `web/logic.js` — a standalone `search=` JSON
      blob (own hash segment, same "own key, own JSON payload" shape as
      `cmp=`, deliberately independent of `encodeHash`'s mode/use/lat/lng
      since a search center isn't "the clicked point"), rounding lat/lng to
      5 decimals and radius to the nearest meter; `decodeSearchHash` returns
      `null` outright for an absent/malformed `search` segment and `null`
      per-field for anything unparseable or a non-positive radius, same
      don't-trust-verbatim contract the other decoders use. Added a "🔗
      Share" button next to "Search here" in the search panel
      (`web/explore.html`) that captures the *current* map center + the
      selected radius + the current use into a copyable link (same `copy()`
      clipboard helper the Compare list's "🔗 Share list" button already
      uses). Wired the read side into `applyHash()`: a valid `search=`
      segment now re-selects the use, re-centers the map, opens the search
      panel, sets the radius `<select>` to the shared value, and re-runs
      `runCandidateSearch()` — so opening a shared link reproduces the same
      ranked results, not just the same panel state — while a
      use/radius/center that no longer resolves (stale link, or a use with
      neither reverse-search signal) safely falls through without throwing.
      Added 6 new unit tests for `encodeSearchHash`/`decodeSearchHash`
      (round trip, decimal/meter rounding, absent/malformed-JSON/non-object
      payload → null, missing/unparseable fields → null per-field not NaN, a
      zero/negative radius rejected, coexistence with a `mode=`/`cmp=` hash
      without cross-corruption). Verified: `python -m pytest -q` (15
      passed), `simy validate` (OK, 6 land uses), `node --test
      tests/js/*.test.mjs` (149 passed, 6 new), and headless Chromium:
      both pages load with zero console/page errors; loading `explore.html`
      with a synthetic
      `#search={lat:30.372,lng:-97.982,radius:1200,use:"food_truck_court"}`
      hash already in the URL correctly switched to Test-a-use mode,
      selected `food_truck_court`, centered the map, opened the search panel
      with the radius `<select>` at `1200`, and (with `overpassRaw` mocked)
      running the resulting search produced real ranked candidate rows end
      to end; and clicking the new "🔗 Share" button with clipboard
      permissions granted produced a well-formed `#search=...` link on the
      clipboard that decodes back to the exact center/radius/use it was
      built from. Outbound network to Overpass is blocked from this
      sandbox, so a live end-to-end shared-search link on the real site is a
      good human spot-check.
- [x] **Reverse search coverage for fast_casual.** Made the product call this
      item asked for: fast_casual deliberately keeps `preferNear`-only
      (no `preferFar`), rather than gaining an inverted competition gate like
      warehouse_club/food_truck_court/ev_charging_hub. Those three model a
      fixed nearby demand pool that one more entrant just splits (a second
      Costco, food truck, or charger competes for the same rooftops/drivers),
      so distance from the nearest existing one is the right gate. A
      fast-casual restaurant is different — real commercial-real-estate
      practice ("restaurant row") is that nearby QSR/fast-casual competitors
      share drive-thru/parking traffic and benefit from cross-shopping, so
      proximity to existing competitors isn't a bad sign the way it is for
      the other three. Documented the reasoning directly in
      `data_sources/layers.yaml`'s `fast_casual` entry (a comment, since
      "deliberately absent" is otherwise indistinguishable from "someone
      forgot it") and cross-referenced it from `reverseSearchSignals`'s
      existing doc comment in `web/logic.js`, which already implements this
      behavior correctly (`preferNear` only) — no functional/scoring change
      needed, this closes the open design question the item raised. Verified:
      `python tools/build_model_json.py` (unchanged output — a YAML comment,
      no data field changed), `python -m pytest -q` (15 passed), `simy
      validate` (OK, 6 land uses), `node --test tests/js/*.test.mjs` (149
      passed, no new tests needed since no behavior changed), and headless
      Chromium confirms both `web/explore.html` and `web/index.html` still
      load with zero console/page errors.

## Next (breadth) — newly added (6)
- [x] **CSV export for reverse-search candidate results.** Added a
      "⬇️ Download CSV" button to the "🔍 Find candidate sites" results panel
      (`web/explore.html`), reusing the same `toCsv`/`Blob`+anchor pattern as
      `downloadCompareCsv`, only rendered once a search actually returns a
      non-empty ranked candidate list (no button on the "no candidates
      matched" state). Extracted the per-candidate "why" text (e.g. "≈12
      rooftops within 1.2 km · nearest food vendor 1.6 km away") out of
      `explore.html`'s local `candWhyText` into a new pure `candidateWhyText(r,
      sig, cfg)` in `web/logic.js` — shared by the map-popup/list-row HTML
      rendering (still `esc()`-wrapped there) and the new `candidatesToCsvRows(
      results, sig, cfg)`, which shapes a `rankCandidates()` result list into
      `toCsv()`-ready rows (rank, lat, lng, score, why). `lastCandidates`/
      `lastCandSig`/`lastCandCfg` track the most recently rendered search so
      the CSV button doesn't need to re-derive them from the DOM, and are
      cleared on `closeSearchPanel()`. Added 10 new unit tests for
      `candidateWhyText` (each signal alone, both on, neither on, singular
      "rooftop" vs plural) and `candidatesToCsvRows` (row shape, empty list,
      missing/null results, a real `toCsv()` round trip). Verified: `python
      tools/build_model_json.py` (unchanged output — no YAML/model change),
      `python -m pytest -q` (15 passed), `simy validate` (OK, 6 land uses),
      `node --test tests/js/*.test.mjs` (159 passed, 10 new), and headless
      Chromium confirms both pages load with zero genuine console/page errors
      and, driven end to end with a real ranked candidate list, the CSV
      button renders, `downloadCandidatesCsv()` produces the exact expected
      rows via a real anchor-click, and `lastCandidates` correctly clears on
      panel close.
- [x] **7th land use: senior living / assisted-care facility.** Added
      `senior_living` to `data_sources/layers.yaml`: demand keys off an
      older-skewing nearby population instead of raw rooftop count — the
      trade-area median age the multi-tract Census ACS read
      (`aggregateAcsTracts`) already resolved for warehouse_club/fast_casual's
      due-diligence panel but nothing had consumed as an actual verdict input
      until now — plus a 2.5-acre site-size gate and a farther-is-better
      competition gate (existing assisted-living/nursing facilities within the
      trade area; OSM `amenity=social_facility` with
      `social_facility=assisted_living|nursing_home`, plus the legacy
      `amenity=nursing_home` tag). Added the new-verdict-shape pure helper
      `seniorDemandRead(medianAge, ageThreshold)` to `web/logic.js` (same
      "null until known" / "≥85% of threshold passes" contract `blendedDemand`
      already established) with 4 new unit tests. Wired the usual
      `slState`/`maybeRenderSLVerdict` pattern into `web/explore.html`
      (mirroring food_truck_court/ev_charging_hub's wait-for-every-leg,
      farther-is-better competitor rendering), added `senior_living` to the
      use-selector order, and extended the trade-area-ACS due-diligence panel
      (previously gated to `AMENITY_USES`) to also render for this use, since
      here the ACS read isn't just due diligence — it's the demand signal
      itself. Verified: `python tools/build_model_json.py` (7 land uses, up
      from 6), `python -m pytest -q` (15 passed), `simy validate` (OK, 7 land
      uses), `node --test tests/js/*.test.mjs` (163 passed, 4 new), and
      headless Chromium confirms both pages load with zero genuine
      console/page errors and, driven end to end with a mocked ACS/parcel/
      Overpass fetch (median age 44.2, parcel 3.5 ac, no nearby competitors),
      `maybeRenderSLVerdict` renders a real "✓ PASS" verdict citing all three
      legs.
- [x] **One more parcel county.** Added San Diego County, CA as a 9th
      `PARCEL_SOURCES` entry — the countywide parcel layer maintained by
      SanGIS (the City/County of San Diego's joint-powers GIS warehouse),
      `webmaps.sandiego.gov/arcgis/rest/services/DoIT_Public/DoIT_Public/MapServer/4`,
      found via web search since this sandbox 403s on direct ArcGIS REST
      introspection (same bot-blocking every prior county addition hit —
      confirmed again this run against three other San Diego-area ArcGIS
      hosts before falling back to search snippets). Added `APN_8`/`PARCELID`
      to the shared `pick()` id candidate list and `ASR_LANDUSE` to the land-use
      list; the address field (`SITUS_ADDRESS`) was already covered by an
      existing county's candidate. The layer splits assessed value into
      `ASR_LAND`/`ASR_IMPR` with no combined total field, so — same call as
      Miami-Dade's `LND_SQFOOT` unit mismatch — value is left unmapped rather
      than showing a partial number. California's AB 1785 pulled APN search
      from the Assessor's public online record portal in Dec 2024 and no
      stable per-APN deep-link is documented, so — same call as
      Harris/Bexar/LA/King/Miami-Dade — `record()` sends people to the
      Assessor's secured-roll search page instead of guessing a link shape.
      CA counties zone unincorporated land, so this reuses LA County's
      zoning note rather than the "doesn't zone" TX copy. Verified:
      `python -m pytest -q` (15 passed), `simy validate` (OK, 32 sources),
      `node --test tests/js/*.test.mjs` (163 passed, unchanged — this item
      only touches `explore.html`'s data table, not `logic.js`), and headless
      Chromium confirms both `web/explore.html` and `web/index.html` load
      with zero genuine console/page errors and that the new source's
      `inBbox` correctly routes a downtown-San-Diego point to it (and still
      finds no source for an out-of-coverage point, Denver) with 9 sources
      total.
      Live spot-check on the real site (actual field values, real APN) is a
      good human follow-up, same as every prior county addition.

## Next (breadth) — newly added (7)
- [x] **Dark mode for the landing page (`web/index.html`).** *(Backlog
      correction: this was already shipped — `web/index.html` already has
      the full `data-theme="dark"` custom-property block, the shared
      `simy_theme` localStorage key, the before-first-paint inline script,
      and a `#themeToggle` button — confirmed by inspecting the live file,
      not just the backlog text. Re-marked done rather than redone; this
      entry had drifted back to unchecked, presumably from an earlier
      backlog-merge conflict across concurrent sessions.)*
- [x] **Respect `prefers-reduced-motion` on `web/index.html`'s decorative
      animations.** *(Backlog correction: also already shipped — `.dash`/
      `.spin`'s `animation` declarations are already scoped inside
      `@media (prefers-reduced-motion: no-preference)` in the live file.
      Same drift as the item above.)*
- [x] **PDF export option for "Make the case."** Added a "📄 Download PDF"
      button next to the existing "🖼️ Download image" one (distinct from
      the pre-existing "🖨️ Print report" button, which opens the browser's
      print dialog rather than producing a file). No vendored library —
      `web/logic.js` gained a minimal hand-rolled single-font PDF-1.4 writer
      (`buildSimplePdf`): one Catalog/Pages/Page(s)/Contents/Font object
      graph, a byte-exact xref table computed while serializing, Courier as
      the one standard-14 font (no embedding). Courier is fixed-pitch, so
      `downloadCasePdf` (`web/explore.html`) wraps the case text by
      character count via the existing `wrapText()` — exact for this font,
      not an approximation the way canvas pixel-measurement would need to
      be. `toPdfSafeText` maps the handful of non-Latin-1 characters
      `buildCaseText()` actually emits (em dash, bullet, the standoff-arrow)
      to ASCII, falling back to "?" for anything else — the standard-14
      fonts only support WinAnsiEncoding, and embedding a real font for full
      Unicode is out of scope for a writer this small. Caught and fixed a
      real bug via testing: `toPdfSafeText` originally iterated with
      `.split("")`, which breaks a surrogate-pair emoji into two lone
      surrogates (each independently falling back to "?", so "🌱" wrongly
      became "??" instead of one "?") — fixed by iterating with `[...s]`
      (Unicode code points, not UTF-16 code units). Added 21 new unit tests
      (character-mapping, PDF-string escaping, header/trailer/object-graph
      shape, pagination math, the surrogate-pair case, and a "every output
      character is a single byte" invariant the Blob-conversion step relies
      on). Verified beyond the unit tests with an independent, non-Node PDF
      parser (Python's `pdfminer.six`, since this repo ships no JS PDF
      reader to self-check against): generated a PDF via `buildSimplePdf`
      directly (single-page and a 5-page/189-line case) and had `pdfminer`
      parse the document structure and extract text — both parsed cleanly
      and the extracted text matched the source exactly (modulo the
      intentional ASCII substitutions), including across a real page break.
      Then, in headless Chromium, drove a real `map.fire("click", …)` →
      `analyze()` → clicked the live "📄 Download PDF" button (with
      `Blob`'s constructor intercepted to capture the exact bytes handed to
      it, and `HTMLAnchorElement.prototype.click` stubbed to avoid a real
      file-download side effect in headless mode) and fed *those* bytes back
      through `pdfminer` — parsed cleanly, extracted text matched the live
      page's actual verdict/stakeholder/permalink content exactly. Both
      pages still load with zero console/page errors.

## Next (breadth) — newly added (9)
- [x] **8th land use: urgent care / walk-in medical clinic.** Every land use so
      far reads demand as either raw nearby rooftops (warehouse_club,
      food_truck_court, ev_charging_hub), a daytime-population blend
      (fast_casual), or trade-area median age (senior_living) — none reads
      "how far is the nearest existing option," which is exactly the gate a
      walk-in clinic operator actually uses (a second urgent care two blocks
      from an existing one splits the same patient pool). Add `urgent_care`
      to `data_sources/layers.yaml`: `requires.demand` = nearby rooftops
      within a short (~3 km) drive-time radius (same proxy style
      food_truck_court/ev_charging_hub already use, documented as
      imperfect), `requires.parcel.min_buildable_acres` ~1 (a single-story
      clinic + a small parking lot, smaller than warehouse_club, bigger than
      a food-truck lot), and the established inverted
      `requires.competition.min_distance_km_from_nearest` gate against
      existing urgent-care/walk-in clinics — OSM tagging here is genuinely
      messy (no single dominant tag the way `amenity=charging_station` is
      unambiguous for EV chargers), so the query will need to be documented
      as a best-effort proxy (`amenity=clinic` plus `healthcare=clinic`,
      OR'd, both known to catch real-world false positives like dental/vet
      offices — note this honestly in a YAML comment, same as every prior
      use's proxy caveats). Wire `maybeRenderUCVerdict`/`ucState` in
      `web/explore.html` following the `maybeRenderFTCVerdict`/
      `maybeRenderEVVerdict` wait-for-every-leg pattern exactly (rooftop leg
      + acreage leg + competitor-distance leg). Confirm
      `reverseSearchSignals` (`web/logic.js`) needs no change (it already
      generalizes over any `min_distance_km_from_nearest` field and any
      `roofNeed`), same "free" reverse-search coverage ev_charging_hub got.
      Shipped as specced: `urgent_care` added to `data_sources/layers.yaml`
      (3 km/8 min rooftop-demand radius, `min_buildable_acres: 1.0`,
      `competition.min_distance_km_from_nearest: 2.0`, an honest YAML comment
      on the `amenity=clinic`/`healthcare=clinic` OR'd query's known
      false-positive risk). Wired `ucState`/`maybeRenderUCVerdict` in
      `web/explore.html`, byte-for-byte the same wait-for-all-three-legs
      pattern as `maybeRenderFTCVerdict` (rooftop leg from `runDemand`'s
      rooftop count, acreage leg from `showParcel`, competitor-distance leg
      from `runDemand`'s compQ scan) — added to the `USE_DEMAND` config, the
      use-selector `order` array, the `analyze()` state-reset blocks (both
      the build-mode init and the explore-mode teardown), and the
      isDC/isFC/…/isUC live-area-read header text. Confirmed
      `reverseSearchSignals` needed zero changes — it already generalizes
      over any `min_distance_km_from_nearest` field and any `roofNeed`, so
      urgent_care got reverse-search "🔍 Find candidate sites" coverage for
      free, same as ev_charging_hub. Verified: `python -m pytest -q` (15
      passed), `simy validate` (OK, 8 land uses), `node --test tests/js/*.test.mjs`
      (172 passed, no JS-side test changes needed since no new pure helper
      was added), and headless Chromium confirms both pages load with zero
      genuine console/page errors; a real simulated map click with
      `urgent_care` selected renders the full result panel end-to-end
      without throwing; and driving `maybeRenderUCVerdict` directly through
      PASS / SHORT-on-demand / SHORT-on-site-size / SHORT-on-competitor-too-close
      / no-competitor-in-range (passes) / acreage-unavailable / no-rooftop-read
      / wrong-use-selected states all produced correct verdict text and CSS
      classes with zero throws. Outbound network to Overpass/ArcGIS is
      blocked from this sandbox, so a live end-to-end rooftop/acreage/clinic
      fetch on the real site is a good human spot-check.
- [x] **10th parcel county.** Added Dallas County, TX as a 10th
      `PARCEL_SOURCES` entry — `maps.dcad.org`'s
      `Property/ParcelQuery/MapServer/4` (the "ParcelPublishing" layer),
      found via web search since this sandbox 403s on direct ArcGIS REST
      introspection (same bot-blocking every prior county addition hit).
      Confirmed via multiple independent search-indexed snippets of the
      layer's own field schema: `PARCELID` (already in the shared `pick()`
      id list from San Diego — no change needed there), `OWNERNME1`
      (owner), and `SITEADDRESS` (address) — added the latter two to the
      shared owner/address candidate lists. Land-use and land/improvement
      value field names weren't independently confirmed with the same
      cross-source confidence (only partial/truncated schema snippets
      turned up), so — same call as every thin-schema county here (King,
      Cook, Miami-Dade's `LND_SQFOOT`, San Diego's split
      `ASR_LAND`/`ASR_IMPR`) — left unmapped rather than guessing a field
      that isn't actually there or rendering a bogus partial number. DCAD
      does publish a per-account record page
      (`dallascad.org/acctDetailRes.aspx?ID=…`), but whether `PARCELID`'s
      field values exactly match that URL's expected ID format wasn't
      confirmed with enough confidence, so — matching this item's own
      "prefer a real deep link only if documented" instruction — `record()`
      sends people to DCAD's account search page instead of guessing a URL
      shape that might 404. Dallas is a TX county, so it reuses the "TX
      counties don't zone" `zoning_note`. Verified: `python -m pytest -q`
      (15 passed), `simy validate` (OK, unchanged — this item only touches
      `explore.html`'s JS `PARCEL_SOURCES` array, not `data_sources/*.yaml`),
      `node --test tests/js/*.test.mjs` (178 passed, unchanged — this item
      only touches `explore.html`'s data table, not `logic.js`), and
      headless Chromium confirms both `web/explore.html` and
      `web/index.html` load with zero
      genuine console/page errors; `inBbox` correctly routes a
      downtown-Dallas point to the new source (and still finds no source
      for an out-of-coverage point, Denver) with 10 counties total; and a
      real `analyze()` call built the panel, then `showParcel` was driven
      directly with a mocked Dallas-shaped ArcGIS attribute payload
      (`PARCELID`/`OWNERNME1`/`SITEADDRESS`) and rendered the parcel ID,
      owner, address, the TX zoning note, and the record link correctly
      with zero throws. Live endpoint reachability and the exact field
      formats couldn't be confirmed from this sandbox — a live spot-check
      is a good human follow-up, same as every prior county.
- [x] **Printable / exportable report for the reverse-search candidate list.**
      Added a "📄 Download PDF" button next to the existing "⬇️ Download CSV"
      button in the "🔍 Find candidate sites" results panel. Added a pure
      `buildCandidatesReportText(useLabel, center, radiusM, results, sig,
      cfg)` to `web/logic.js` — mirrors `buildCaseText`'s role for the
      single-parcel case, built from `lastCandidates`/`lastCandSig`/
      `lastCandCfg` instead of a single parcel's verdict state: a header line
      with the tested use's label, the search center + radius, the candidate
      count, then one numbered `rank. <candidateWhyText> (score N)` line per
      result (reusing the exact same per-row "why" text the CSV export and
      results list already render, so all three surfaces stay consistent). A
      missing/malformed center falls back to "?, ?" rather than throwing or
      emitting "NaN, NaN". `downloadCandidatesPdf()` (`web/explore.html`)
      wires it up byte-for-byte the same way `downloadCasePdf` already does
      for the single-parcel case — `wrapText` line-wraps by Courier's fixed
      0.6em-per-glyph character width, `buildSimplePdf` (the hand-rolled
      PDF-1.4 writer already added for the single-parcel PDF export) writes
      the file, downloaded as `simycity-<use>-candidates.pdf` via the same
      Blob+anchor pattern every other client-side export in this app uses —
      no vendored PDF library, no network call. Added 7 new unit tests for
      `buildCandidatesReportText` (header/center/radius/count/per-row
      formatting, singular "1 candidate found", whole-kilometer vs.
      one-decimal radius formatting matching the existing radius-select
      convention, empty candidate list, null/undefined results list,
      missing/malformed center). Verified: `python -m pytest -q` (15
      passed), `simy validate` (OK, 8 land uses), `node --test
      tests/js/*.test.mjs` (178 passed, 7 new), and headless Chromium
      end-to-end: both pages load with zero console/page errors; switching
      to Test-a-use mode with `food_truck_court` selected, opening the
      search panel, and running a real `runCandidateSearch()` against a
      mocked `fetch` populated `lastCandidates`; clicking the real "Download
      CSV" and "Download PDF" buttons each fired a real browser download
      event with the correct filename extension, and the downloaded PDF's
      bytes start with the `%PDF-` magic header and contain the expected
      "N candidates found" text — a genuine file was produced, not just a
      function call that didn't throw. Outbound network to Overpass is
      blocked from this sandbox (as with every prior reverse-search item),
      so a live end-to-end search-then-export on the real site is a good
      human spot-check.

## Next (breadth) — newly added (10)
- [x] **11th parcel county.** Added Allegheny County, PA (Pittsburgh) as an
      11th `PARCEL_SOURCES` entry — `gisdata.alleghenycounty.us`'s
      `EGIS/Web_Parcels/MapServer/0`, the county's own public parcel-boundary
      service backing its Real Estate Portal map tab (confirmed via web
      search: display field `PIN`, and it's explicitly the layer behind a
      parcel-boundary map view, not a point layer — this sandbox 403s on
      direct ArcGIS REST introspection, same constraint every prior county
      hit, so geometry type had to be inferred from the service's documented
      purpose rather than confirmed directly). `PIN` was already in the
      shared id `pick()` list (from King County); added `OWNERDESC`,
      `PROPERTYADDRESS`, `CLASSDESC`/`USEDESC`, and `FAIRMARKETTOTAL` as new
      owner/address/land-use/value candidates — these are the well-documented
      field names from Allegheny's companion WPRDC Property Assessments
      dataset, not independently confirmed on this specific MapServer layer,
      so same graceful thin-schema handling as every other county here if a
      name doesn't actually match (`pick()` just skips it, no throw). Left
      acreage unmapped: the assessment roll's `LOTAREA` is square feet, not
      acres, same unit-mismatch call that left LA's/Miami-Dade's area fields
      unmapped. Also skipped a per-parcel record deep link — the portal's
      `GeneralInfo?ID=` URL takes a zero-padded PIN whose exact padding rule
      for an arbitrary PIN wasn't confirmed from one sample — so, same call
      as Harris/Bexar/LA/King/Miami-Dade/San Diego/Dallas, `record()` links
      to the portal's search page. Pennsylvania has no unincorporated county
      land at all — every parcel sits inside a city/borough/township, whose
      government (not the county) sets zoning — a genuinely new
      `zoning_note` shape versus the incorporated-vs-unincorporated split
      every other state here has. Verified: `python -m pytest -q` (15
      passed), `simy validate` (OK, 8 land uses — this item only touches
      `web/explore.html`, no data_sources/*.yaml change), `node --test
      tests/js/*.test.mjs` (182 passed, no new JS logic — `PARCEL_SOURCES`
      itself isn't unit-tested, same as every prior county), and headless
      Chromium: both pages load with zero console/page errors; `inBbox`
      correctly routes a downtown-Pittsburgh point to the new source (and
      still finds no source for Denver); driving the shared field-`pick()`
      calls directly against a mocked Allegheny-shaped ArcGIS attribute
      payload (`PIN`/`OWNERDESC`/`PROPERTYADDRESS`/`CLASSDESC`/
      `FAIRMARKETTOTAL`) resolved every field correctly; and a real simulated
      map click on the new county's coverage area ran without throwing. Live
      endpoint reachability and the exact field names couldn't be confirmed
      from this sandbox — a live spot-check is a good human follow-up, same
      as every prior county.
- [x] **PDF export for "Compare parcels".** Added a "📄 Download PDF" button
      (`#comparePdf`) to the Compare modal alongside the existing "⬇️ Download
      CSV" button, same pairing the single-parcel "Make the case" panel and
      the reverse-search candidate list already got in earlier runs. Added a
      pure `buildCompareReportText(pins)` to `web/logic.js` (mirrors
      `buildCandidatesReportText`'s role) that renders each pinned parcel as
      a numbered section (site/owner/acreage/appraised value/land use/county,
      plus Testing/Verdict only when the pin carries a Test-a-use verdict —
      Explore-mode pins omit those two lines rather than printing "Testing:
      —"), reusing the existing hand-rolled `buildSimplePdf` PDF-1.4 writer
      (no vendored library, no network call) exactly like `downloadCasePdf`/
      `downloadCandidatesPdf` already do. A missing/malformed field renders
      "—" (site falls back to "lat, lng" or "?, ?") rather than "undefined"
      or throwing, and an empty/null/undefined pins list renders a valid "0
      parcels pinned" report instead of a blank or broken PDF — so, unlike
      the candidate-list PDF (which no-ops with nothing pinned), the new
      `downloadComparePdf()` doesn't need its own empty-list guard; the
      *button* still shows the same "⚠ pin a parcel first" inline message
      the CSV button already gives when clicked with nothing pinned. Added 4
      new unit tests (full multi-field render, singular "1 parcel pinned" +
      Testing/Verdict omitted for an Explore-mode pin, empty/null/undefined
      list, missing-fields-render-"—"-and-a-null-pin-in-the-list-doesn't-throw)
      following the existing `buildCandidatesReportText` test style. Verified:
      `python -m pytest -q` (15 passed), `simy validate` (OK, 8 land uses),
      `node --test tests/js/*.test.mjs` (182 passed, 4 new), and headless
      Chromium end-to-end: both pages load with zero console/page errors;
      seeding two pins (one full Test-a-use pin with a comma-containing owner
      name, one all-nulls Explore-mode pin) and driving the real Compare-open
      → "Download PDF" click end to end produced a real download event with
      filename `simycity-compare.pdf` and the "✓ PDF downloaded" message; the
      empty-pins case correctly showed "⚠ pin a parcel first" without
      throwing; and the PDF bytes start with the `%PDF-` magic header. No
      network involved — pure client-side reordering of already-resolved
      snapshots, same as every other Compare export.
- [x] **Wire a real highway/arterial traffic-count check.**
      `data_sources/layers.yaml`'s `requires.transportation.near_highway_aadt:
      40000` (warehouse_club) and `near_arterial_aadt: 20000` (fast_casual)
      were descriptive-only. Investigated whether a free, keyless AADT
      (Annual Average Daily Traffic) source exists — confirmed (via web
      search; this sandbox's egress policy blocks direct ArcGIS REST
      introspection of any candidate host, same constraint every
      PARCEL_SOURCES entry has always had) that no single *national*
      real-time AADT point-query API exists, but a better-than-expected
      national source does: BTS/FHWA's National Transportation Atlas Database
      (NTAD) publishes the National Highway System (NHS — the interstate/
      major-highway/principal-arterial network) as a public ArcGIS Online
      FeatureServer with a plainly-named `AADT` field per BTS's own field
      docs — genuinely national, one query, no per-state fan-out needed
      (unlike PARCEL_SOURCES, where no such single source exists for
      parcels). Wired it as a real third verdict leg for both uses: added
      `AADT_SOURCE` (a single FeatureServer URL, `web/explore.html`) and a
      new `arcgisNearQuery(base,latlng,radiusM)` helper — like the existing
      `arcgisPointQuery` but with an ArcGIS spatial `distance` buffer for a
      point/line layer searched *within a radius*, rather than an exact
      point-in-polygon lookup. Added `parseAadtFeatures(json)` and
      `maxAadtWithinRadius(points,center,radiusM)` to `web/logic.js` — the
      former handles both point geometry (`x`/`y`) and polyline geometry
      (`paths`, using the segment's first vertex as a representative point),
      since NHS's exact geometryType wasn't independently confirmable either,
      and leans on `pick()`'s broad candidate-field-list/case-insensitive
      matching as a fallback in case the live field name differs from `AADT`;
      the latter finds the *busiest* qualifying road within range (a
      high-volume highway 1 km away matters more for this gate than a
      literal-nearest quiet street). Wired into `runDemand`'s leg fan-out (1d)
      and a new shared `trafficLeg(s,minAadt)` used by both
      `maybeRenderWCVerdict` and `maybeRenderFCVerdict` — a genuine query
      failure reads as a fail (same fetch-error convention every other leg
      already has); a successful query that finds no NHS route in range at
      all reads as a real fail too (a genuine "not near the highway/
      major-arterial network" finding, not a coverage gap, since coverage is
      national). Fixed a bug caught during the browser drive-through before
      shipping: fast_casual's demand headline was accidentally gated on the
      *combined* pass (demand AND traffic) instead of the demand leg alone,
      so a site with plenty of demand but a failing traffic leg showed a
      contradictory "✗ ~25,000 effective demand units vs the ~9,000 needed"
      message even though demand actually cleared at 278% — split the
      headline text back to depend on the demand leg's own pass/fail, with
      the traffic leg's separate ✓/✗ line explaining the rest. Added 15 new
      unit tests for `parseAadtFeatures`/`maxAadtWithinRadius` (confirmed-field
      read, candidate-list fallback, route-name capture, polyline-vertex
      fallback, invalid/negative/missing AADT dropped, missing coordinates
      dropped, malformed response, busiest-not-nearest selection, radius
      exclusion, empty list, invalid center, route passthrough). Verified:
      `python -m pytest -q` (15 passed), `simy validate` (OK, 8 land uses —
      no `layers.yaml` change), `node --test tests/js/*.test.mjs` (194 passed,
      15 new), and headless Chromium: both pages load with zero console/page
      errors; drove `maybeRenderWCVerdict`/`maybeRenderFCVerdict` directly
      through PASS / SHORT-on-traffic-only (with demand/acreage both clearing)
      / no-NHS-route-in-range / traffic-lookup-failed / still-pending states
      for both uses, all producing correct verdict text, CSS class, and
      leg-level ✓/✗/? text with zero throws; and drove the real
      `arcgisNearQuery` → `parseAadtFeatures` → `maxAadtWithinRadius` chain
      end-to-end against a mocked `fetch` returning an NHS-shaped response
      (point geometry, `AADT`/`ROUTE_NAME` fields), correctly resolving the
      busiest in-range route. Outbound network to `services.arcgis.com` is
      blocked from this sandbox, so live reachability, the NHS layer's actual
      geometryType, and the exact field name (`AADT` vs. a fallback candidate)
      are a good human spot-check — same caveat every PARCEL_SOURCES entry
      has carried since the first county was added.

## Next (breadth) — newly added (11)
- [x] **9th land use: self-storage facility.** Added `self_storage` to
      `data_sources/layers.yaml`: `requires.demand` reads nearby rooftops at
      a 2.5 km radius (people rent storage close to home, tighter than
      `warehouse_club`'s citywide pull but wider than `food_truck_court`'s
      walk radius), `requires.parcel.min_buildable_acres: 2.0` (a
      multi-building storage campus — bigger than `urgent_care`'s
      single-clinic lot, smaller than `warehouse_club`'s big-box pad), and
      the established inverted `requires.competition.min_distance_km_from_nearest:
      1.5` gate against existing self-storage facilities. OSM tags this
      unambiguously as `shop=storage_rental` — no OR-fallback needed the way
      `urgent_care`'s messy clinic tagging required, so the live query is a
      single tag, same confidence as `amenity=charging_station` for EV
      chargers. Wired `ssState`/`maybeRenderSSVerdict` in `web/explore.html`
      following the `maybeRenderUCVerdict` wait-for-every-leg pattern exactly
      (rooftop leg from `runDemand` + acreage leg from `showParcel` +
      competitor-distance leg from `runDemand`'s competitor scan, all
      resolving before one verdict renders); added to the use-selector order
      and both `analyze()` state-reset blocks (build-mode init and
      explore-mode reset); also updated the "Live area read" section-title
      and caption ternaries (`isSS`) so self_storage gets its own real
      "demand + site-size + distance-from-competitors" description instead
      of falling through to the generic "real demand"/"rooftops proxy
      household demand" text meant for uses with no real verdict.
      Confirmed `reverseSearchSignals` (`web/logic.js`) needed no change —
      it already generalizes over any `min_distance_km_from_nearest` field
      and any `roofNeed`, so self_storage gets both `preferFar` and
      `preferNear` (verified via a direct headless-browser call) and "🔍 Find
      candidate sites" coverage for free, same as `ev_charging_hub`/
      `urgent_care`. Verified: `python -m pytest -q` (15 passed), `simy
      validate` (OK, 9 land uses), `python tools/build_model_json.py`
      (9 land uses, 32 sources), `node --test tests/js/*.test.mjs` (194
      passed, unchanged — this item only touches `explore.html`'s use
      wiring and `layers.yaml`, no `logic.js` change), and headless
      Chromium confirms both `web/explore.html` and `web/index.html` load
      with zero genuine console/page errors; selecting `self_storage` and
      simulating a map click builds real `ssState`; driving
      `maybeRenderSSVerdict` directly through PASS / SHORT-on-site-size /
      SHORT-on-competitor-too-close / SHORT-on-demand / acreage-unavailable
      / no-rooftop-read / wrong-use-selected all produced correct verdict
      text and CSS classes with zero throws. Outbound network to Overpass/
      ArcGIS is blocked from this sandbox, so a live end-to-end
      rooftop/acreage/self-storage-competitor fetch on the real site is a
      good human spot-check.
- [x] **12th parcel county.** Added Wake County, NC (Raleigh) as a 12th
      `PARCEL_SOURCES` entry — `maps.wake.gov`'s (with a `maps.wakegov.com`
      fallback host, same "different host, same layer" pattern Travis
      already established) `Property/Parcels/MapServer/0`. Fills the
      Southeast gap this item called out (previously only Miami-Dade), even
      though the specific Fulton County, GA suggestion wasn't the one
      picked. Found via web search since this sandbox blocks direct egress
      to `*.wake.gov`/`*.arcgis.com` (same constraint every prior county
      hit) — but unusually well-confirmed for this pass: multiple
      independent search hits converged on the same full field list
      (`PIN_NUM`, `REID`, `OWNER`, `SITE_ADDRESS`, `DEED_ACRES`,
      `TOTAL_VALUE_ASSD`, `TYPE_USE_DECODE`, and more), and — better than
      most prior counties — a *confirmed working per-parcel deep link*:
      `services.wake.gov/realestate/Account.asp?id=<7-digit REID>`, verified
      against half a dozen live example URLs a search engine had indexed
      directly (not guessed the way Harris/Bexar/LA/King/Miami-Dade/San
      Diego/Dallas/Allegheny all had to fall back to a search-page link
      instead). `REID` is the record-lookup key, distinct from `PIN_NUM`
      (the parcel/tax-map id shown as "Parcel ID"), so `record()` reads it
      separately — `String(reid).padStart(7,"0")` guards against ArcGIS
      returning it as a number and silently dropping a leading zero. Added
      `PIN_NUM`, `SITE_ADDRESS`, `TYPE_USE_DECODE`, `DEED_ACRES`, and
      `TOTAL_VALUE_ASSD` to the shared `pick()` candidate lists (`OWNER` was
      already covered by an existing entry). NC, like AZ/CA/WA/IL/FL, zones
      unincorporated land (unlike TX, and unlike PA which has none at all),
      so this got its own `zoning_note`. Verified: `python -m pytest -q`
      (15 passed), `simy validate` (OK, 9 land uses), `node --test
      tests/js/*.test.mjs` (all passing, no JS-side test changes needed
      since no new pure helper was added — `PARCEL_SOURCES`/`pick()` are
      plain data/config, not new logic), and headless Chromium: both pages
      load with zero genuine console/page errors; `inBbox` correctly routes
      a downtown-Raleigh point to the new source and still finds no source
      for an out-of-coverage point (Denver); driving `showParcel` directly
      with a mocked Wake-shaped ArcGIS attribute payload rendered parcel
      ID/owner/address/land-use/acreage ("0.42 ac")/appraised value
      ("$350,000") correctly, and `src.record(...)` built the exact expected
      zero-padded `Account.asp?id=0418139` deep link. Live ArcGIS endpoint
      reachability (do the two hostnames actually both resolve, does the
      live layer still expose these exact field names) couldn't be
      confirmed from this sandbox, so a live spot-check is a good human
      follow-up, same as every prior county.
- [x] **GeoJSON export for pinned Compare parcels and reverse-search
      candidates.** Added pure `pinsToGeoJson(pins)` /
      `candidatesToGeoJson(results, sig, cfg)` helpers to `web/logic.js` —
      each pinned parcel / ranked candidate becomes a `Feature` with a
      `Point` geometry (`[lng, lat]`) and the same field set the CSV export
      already surfaces as `properties` (reusing `candidateWhyText` for the
      candidate list's "why" property, so all three export formats stay
      consistent); a pin/candidate missing valid numeric lat/lng is dropped
      rather than emitting a broken geometry — `candidatesToGeoJson` keeps
      each surviving candidate's *original* list rank (not a post-filter
      renumbering), so a dropped mid-list entry doesn't shift every later
      candidate's rank in the exported file. Added a "🗺️ Download GeoJSON"
      button next to the existing CSV/PDF buttons in both the Compare modal
      and the search-results panel, same Blob+anchor download pattern (MIME
      type `application/geo+json`, pretty-printed) every other client-side
      export in this app already uses — no network call, no vendored
      library; the Compare button reuses the existing "⚠ pin a parcel
      first" empty-state guard the CSV/PDF buttons already have, and the
      search-results button reuses `downloadCandidatesCsv`/`Pdf`'s existing
      "no candidates yet" no-op guard. Added 7 new unit tests mirroring
      `candidatesToCsvRows`'s style (feature/geometry shape, label
      fallback + null-field handling, missing-lat/lng dropped without
      shifting rank, empty/null list still returns a valid empty
      `FeatureCollection`). Verified: `python -m pytest -q` (15 passed),
      `simy validate` (OK, 9 land uses), `python tools/build_model_json.py`
      (unchanged output — this item touches no YAML), `node --test
      tests/js/*.test.mjs` (201 passed, 7 new), and headless Chromium: both
      pages load with zero console/page errors; seeded two Compare pins
      (one with a comma-containing owner name, one all-nulls) and drove the
      real `#compareGeojson` button click end to end (Blob → anchor →
      captured download) — the downloaded file parsed as a valid two-
      feature `FeatureCollection` with the exact expected geometry/
      properties; seeded a real search result set via `renderCandidates()`
      and drove the real `#searchGeojson` button click end to end — the
      downloaded file parsed as a valid `FeatureCollection` with correct
      rank/score/why properties; and a direct in-browser call to
      `candidatesToGeoJson` with a null-lat/lng entry in the middle of the
      list confirmed the drop-without-renumbering behavior live (not just
      in the Node unit tests).

## Next (breadth) — newly added (12)
- [x] **Reverse search coverage for data_center and residential_subdivision.**
      Both used to disable the "🔍 Find candidate sites" button entirely —
      `reverseSearchSignals` only lit up `preferNear` (rooftop-demand) or
      `preferFar` ("farther from a competitor is better"), and neither use
      fit either shape. Rather than inventing new data fetches, reused what
      each use's own verdict *already* fetches: `data_center`'s reverse
      search now runs on the same substation-scan (`USE_DEMAND.data_center.compQ`)
      `maybeRenderDCVerdict` uses, and `residential_subdivision`'s runs on the
      same nearby-schools scan (`compQ`) `maybeRenderResVerdict` uses — no new
      Overpass query shape, just new ways to score the two the reverse-search
      UI was already fetching for every use (one demand/rooftops query, one
      competitors query). Extended `rankCandidates` (`web/logic.js`) with two
      new opts mirroring the original pair: `preferNearComp` (closer to the
      nearest `competitors` entry is *better*, not worse — mirrors `preferFar`,
      including its "no competitor found" sentinel, now a worst-case penalty
      instead of a best-case bonus) and `preferFarDemand` (fewer nearby
      `demandPoints` is *better* — mirrors `preferNear`). `reverseSearchSignals`
      now also takes a third `demandSignals` arg (`use.demand_signals` from
      model.json) and turns `preferNearComp` on for `requires.power.
      prefer_substation_within_km` (data_center's existing requires field —
      ev_charging_hub has the same field but keeps its own `preferFar`
      instead via a `!preferFar` guard, since its `competitors` list means
      "avoid," not "seek") or a new `demand_signals.amenities.
      prefer_school_within_km: 3` added to residential_subdivision in
      `data_sources/layers.yaml`; `preferFarDemand` turns on only for the
      substation case (a data center avoids rooftop-dense land; a subdivision
      obviously doesn't want to avoid rooftops). `candidateWhyText` needed no
      new wording — "nearest power substation 2.1 km away" reads true
      whether closer is better or worse, so `preferNearComp`/`preferFarDemand`
      just share the existing preferFar/preferNear text branches. Added 8 new
      `reverseSearchSignals` tests (data_center's shape, residential's shape,
      the ev_charging_hub non-conflict, missing demand_signals) and 7 new
      `rankCandidates`/`candidateWhyText` tests (preferNearComp vs preferFar
      disagreeing on the same data, preferFarDemand vs preferNear disagreeing,
      the no-competitor worst-case sentinel, both new signals combining).
      Verified: `python -m pytest -q` (15 passed), `simy validate` (OK, 9 land
      uses), `node --test tests/js/*.test.mjs` (214 passed, 15 new), and
      headless Chromium: both pages load with zero console/page errors; live
      end-to-end searches (mocked Overpass) for **both** previously-disabled
      uses now render 8 ranked candidates each with correct "why" text
      (data_center: "≈2 rooftops within 8 km · nearest power substation 0.4
      km away"; residential_subdivision: "nearest school 0.3 km away"),
      clicking a result row ran a real `analyze()` with zero errors, an
      all-empty mocked Overpass response still rendered 8 (correctly-tied)
      candidates without throwing, and food_truck_court's pre-existing search
      behavior is unchanged (regression check).
- [x] **13th parcel county.** Added Fulton County, GA (Atlanta) to
      `PARCEL_SOURCES` (`web/explore.html`) — the first Georgia county, via
      the county's own `PropertyMapViewer` MapServer (layer 11, the tax-parcel
      layer). Same recipe as every prior addition: this sandbox 403s on
      direct ArcGIS REST introspection, so field names were confirmed via
      multiple independent search-indexed sources rather than a direct fetch
      — only `ParcelID`/`Owner`/`Address` came back confirmed for this
      specific layer, so land use/acreage/value were left unmapped rather
      than guessed (same cautious call Dallas/Allegheny made); all three
      confirmed fields already fall through the shared `pick()` lists'
      existing case-insensitive fallback (`PARCELID`/`OWNER`/`ADDRESS`
      already match `ParcelID`/`Owner`/`Address` without needing new list
      entries — verified directly). qPublic (the county's record-search
      system) keys individual parcel pages on an opaque numeric `Q` param
      that isn't derivable from `ParcelID` alone, so — same cautious call as
      Harris/Bexar/LA/King/Miami-Dade/San Diego/Dallas/Allegheny — `record()`
      links to qPublic's search page rather than guessing a per-parcel URL.
      `zoning_note` reflects a real, county-specific fact confirmed via web
      search: a two-decade wave of cityhood incorporations (Sandy Springs
      2005 through City of South Fulton 2017) plus the 2021 Fulton Industrial
      Blvd annexation left almost no unincorporated land in the county at
      all — just a small pocket near Fulton County Executive Airport — so
      the note points to checking whichever city's zoning applies rather
      than the county's (the same "no/near-zero unincorporated land" shape
      Allegheny's PA entry hit, for a different reason). Verified:
      `python -m pytest -q` (15 passed), `simy validate` (OK, 32 sources),
      `node --test tests/js/*.test.mjs` (214 passed, no regressions — this
      item added a data entry, not new logic, so no new JS tests), a
      standalone script confirming the new entry parses, bumps
      `PARCEL_SOURCES` to 13 entries, and its `record()`/`pick()` fallback
      behave as intended, and headless Chromium confirming both
      `web/explore.html` and `web/index.html` still load with zero
      console/page errors. Outbound network to ArcGIS/qPublic is blocked
      from this sandbox, so a live end-to-end parcel fetch inside the new
      Fulton County bbox is a good human spot-check.
- [x] **Sortable reverse-search candidate results.** The "🔍 Find candidate
      sites" results panel (`renderCandidates()` in `web/explore.html`)
      previously only ever rendered in rank order. `sortPins(pins, key, dir)`
      (`web/logic.js`) turned out to already be a fully generic numeric-field
      sorter (missing-field-sorts-last, non-mutating) — nothing about it was
      Compare-pin-specific — so no new sort helper was needed, just new call
      sites keyed on the fields `rankCandidates()` already returns per
      candidate (`score`, `nearestCompetitorKm`, `demandCount`). Split
      `renderCandidates()` into an outer function (stores the fresh
      rank-order results, resets sort state to "rank order" for a new search)
      and an inner `renderCandidateList()` that does the actual draw —
      re-sorting just re-invokes the inner function against the stored
      results. Added clickable "Sort by:" labels mirroring the Compare
      table's `cmpSortBtn` pattern exactly (same CSS class, ▲/▼ indicator,
      `aria-pressed`, second click on the same key flips direction, a
      different key resets to ascending) — only offering the labels a given
      use's signals actually surface in its "why" text (a use with no
      competition signal doesn't get a meaningless "sort by nearest
      competitor" option). Marker numbering, popups, and list-row
      click-through are rebuilt from the currently-sorted array each render
      (not re-derived from the original index), so `#1`..`#8` and
      click-to-analyze always match what's on screen post-sort. CSV/PDF/
      GeoJSON exports intentionally keep reading `lastCandidates` in its
      original rank order regardless of on-screen sort — same "export stays
      canonical" precedent the Compare list's own CSV export already set.
      Added 4 new unit tests exercising `sortPins` against real
      `rankCandidates()` output (ascending/descending by score, a
      no-competitor-in-range point's `null` sorting last regardless of
      direction, sorting by `demandCount`, non-mutation) — covering the same
      cases the Compare-table `sortPins` tests do, on the new call shape.
      Verified: `python -m pytest -q` (15 passed), `simy validate` (OK, 9
      land uses), `node --test tests/js/*.test.mjs` (218 passed, 4 new), and
      headless Chromium: both pages load with zero console/page errors;
      driving `renderCandidates()` directly with a synthetic 3-candidate set
      (including a no-competitor-in-range point) confirmed the sort labels
      render, ascending/descending clicks reorder rows with the missing-value
      point always last, marker/list numbering stays in sync with the sorted
      order, and `lastCandidates` (the export source) stays untouched in
      original rank order; and a full simulated search flow (mocked Overpass,
      food_truck_court, real map center) produced 8 ranked candidates,
      clicking "Score" re-sorted all 8 rows/markers correctly, and clicking a
      result row post-sort ran a real `analyze()` with zero errors.

## Next (breadth) — newly added (13)
- [x] **Saved reverse searches.** Added `addSavedSearch`/`removeSavedSearch`
      to `web/logic.js`, mirroring `addRecentSite`/`removeRecentSite`'s
      cap/shape but deduping on the search's *config* (rounded center +
      radius + use) instead of just a point — re-saving the same area/use
      bumps it to the front with a fresh `savedAt` instead of piling up
      near-duplicates; a different radius or use is a genuinely distinct
      entry. Wired a "⭐ Save this search" button into the existing search
      panel's row (next to "Search here"/"🔗 Share") that persists
      `{label, lat, lng, radiusM, use, savedAt}` to a new
      `simy_saved_searches_v1` localStorage list (cap 8), and a collapsible
      "Saved searches" strip (reusing the recently-viewed strip's markup/CSS
      pattern) listing each with a one-click "run it again" link and a "✕"
      delete button. Extracted the shared "select use, re-center, open the
      panel, re-run" sequence into a new `runSearchConfig(lat,lng,radiusM,use)`
      so both an incoming `#search=..` share link (`applyHash`) and a saved
      search's "run it again" go through the exact same path instead of two
      copies that could drift apart. Added 10 new unit tests for
      `addSavedSearch`/`removeSavedSearch` (prepend, dedupe-by-config on a
      near-identical rounded center, same-center-different-radius/use is
      *not* a dedupe match, cap + default cap, non-mutation, delete by
      index, out-of-range/negative index no-ops, missing-list handling).
      Verified: `python -m pytest -q` (15 passed), `simy validate` (OK, 9
      land uses), `node --test tests/js/*.test.mjs` (229 passed, 10 new),
      and headless Chromium: both pages load with zero console/page errors;
      driving the real save → localStorage → **page reload** →
      `loadSavedSearches()` round trip end to end confirmed the entry
      survives a reload; saving the same config twice stayed at one entry
      (dedupe) while saving a second, different use produced two; clicking
      the real "✕" delete button removed the correct entry and the strip
      correctly hid itself once the list emptied; and driving
      `runSearchConfig` from a saved entry (with `runCandidateSearch`
      stubbed to avoid a live Overpass call) correctly switched mode/use and
      invoked the search — end-to-end, not just at the pure-function level.
- [x] **14th parcel county.** Added Salt Lake County, UT as a 14th
      `PARCEL_SOURCES` entry (`web/explore.html`) — the first Mountain West
      county. Uses UGRC's (Utah's state GIS office) per-county extract of
      the statewide LIR parcel-sharing layer, `Parcels_SaltLake_LIR`, hosted
      as an Esri ArcGIS Online FeatureServer (same class of host — public,
      default-CORS-enabled — as Travis's own `TCAD_Selected_Locations`
      fallback host). Same recipe every prior county addition followed:
      this sandbox 403s on direct ArcGIS REST introspection (confirmed
      again this round — `services1.arcgis.com`, `gis.utah.gov`,
      `opendata.gis.utah.gov`, and `apps.saltlakecounty.gov` all egress-blocked
      even via WebFetch), so field names (`PARCEL_ID`, `PARCEL_ADD`,
      `PARCEL_ACRES`, `PROP_CLASS`, `TOTAL_MKT_VALUE`) were confirmed via
      multiple independent search-indexed sources instead and added to the
      shared `pick()` candidate lists. Owner name is confirmed *absent* from
      this public LIR layer (not just unmapped, unlike a unit-mismatch
      case) — same graceful partial-field-coverage every prior thin-schema
      county here has. No documented per-`PARCEL_ID` deep link for the
      Assessor's Parcel Search app, so — same cautious call as
      Harris/Bexar/LA/King/Miami-Dade/San Diego/Dallas/Allegheny/Fulton —
      `record()` links to the search app itself. `zoning_note` confirms Utah
      counties (unlike TX) do zone unincorporated land. Verified:
      `python -m pytest -q` (15 passed), `simy validate` (OK, 32 sources/16
      layers/10 land uses unaffected by a parcel-source-only change),
      `node --test tests/js/*.test.mjs` (229 passed, no JS logic touched by
      this change), and headless Chromium confirms both pages load with
      zero console/page errors; a real simulated map click at a downtown
      Salt Lake City coordinate correctly matched the new county's bbox and
      attempted the live fetch (reported "couldn't reach the county parcel
      service" — the expected sandbox-network-blocked outcome, not the
      "no parcel layer wired" message a bbox miss would produce) with zero
      throws. A live end-to-end parcel fetch on the real site is a good
      human spot-check.
- [x] **10th land use: child care center / daycare.** Added `child_care_center`
      to `data_sources/layers.yaml` following the same cheap-to-add shape
      every use since `senior_living` has used: `requires.demand.
      min_households_drive_time: 1800`/`drive_time_min: 6` (a tight 1.2 km
      trade area — people drop kids off close to home or on a commute route,
      closer to `food_truck_court`'s radius than `urgent_care`'s),
      `requires.parcel.min_buildable_acres: 0.5` (a small building + a fenced
      play yard, under `urgent_care`'s single-clinic lot), and
      `requires.competition.min_distance_km_from_nearest: 1.0` reusing the
      existing "farther is better" competition read `preferFar`/
      `rankCandidates` already handle. OSM tagging is ambiguous, so the live
      competitor/site query ORs `amenity=childcare` and `amenity=kindergarten`
      independently, same documented messy-tag caveat `urgent_care`'s
      OR-fallback set a precedent for. Wired `maybeRenderCCVerdict` in
      `web/explore.html` following the `self_storage`/`urgent_care` pattern
      exactly (wait for the rooftop leg, the acreage leg, and the
      competitor-distance leg from the existing `runDemand`/`showParcel`
      fan-out, then render one PASS/SHORT verdict) — no changes needed to
      `reverseSearchSignals` (web/logic.js) or the reverse-search UI/exports,
      since both already derive their behavior generically from a use's
      `requires` shape. `simy validate` confirms 10 land uses. Verified:
      `python -m pytest -q` (15 passed), `simy validate` (OK, 32 sources, 16
      layers, 10 land uses), `node --test tests/js/*.test.mjs` (229 passed,
      no new JS logic to test since nothing new was added to `logic.js`), and
      headless Chromium: both pages load with zero console/page errors;
      selecting `child_care_center` correctly enables the reverse-search
      button with 0.6/1.2/2.4 km radius options (derived from its own 1.2 km
      trade area, not a leftover from another use); driving
      `maybeRenderCCVerdict` directly through PASS / SHORT-on-demand /
      SHORT-on-site-size / SHORT-on-competitor-too-close /
      no-competitor-in-range (passes) / acreage-unavailable / no-rooftop-read
      / wrong-use-selected all produced correct verdict text and CSS classes
      with zero throws; a full simulated map click with `child_care_center`
      selected rendered the whole result panel without throwing; and a
      mocked end-to-end reverse search (fake rooftops + one fake competitor)
      returned 8 ranked candidates and rendered the results list/markers with
      zero console errors. Outbound network to Overpass/ArcGIS is blocked
      from this sandbox, so a live end-to-end rooftop/competitor fetch on the
      real site is a good human spot-check.

## Next (breadth) — newly added (14)
- [x] **"Best fit here" step 1: shared verdict-scoring core.** Five of the
      eleven `maybeRender*Verdict` functions in `web/explore.html`
      (warehouse_club, food_truck_court, urgent_care, self_storage,
      child_care_center) each duplicate the exact same three-gate math
      inline: rooftop demand vs. 85%-of-need, parcel acreage vs. a floor,
      nearest-competitor distance vs. a floor (farther-is-better, no
      competitor in range at all reads as the best case, not a data gap).
      Extracted that shared math into a pure, tested `standardUseVerdict(reads,
      thresholds)` in `web/logic.js` — `reads.roofs==null` returns `null`
      ("no read at all," same contract as `blendedDemand`/`seniorDemandRead`);
      `thresholds.minAcres`/`minCompetitorKm` are each optional, omitting one
      skips that gate entirely (reads as trivially satisfied) for uses that
      don't have it (e.g. `ev_charging_hub`'s substation-distance gate isn't
      this shape); a competitor-lookup error fails the distance gate outright,
      matching every existing `farOk` computation. Also added
      `rankLandUseVerdicts(entries)` — sorts a flat list of per-use verdicts
      into the order a future ranked summary table needs: every passing use
      first (highest need-normalized `ratio` — i.e. most comfortable margin —
      first), then every short/no-read use after (closest-to-passing first),
      stable on ties. `ratio` is comparable across land uses with very
      different `roofNeed` magnitudes, which a raw rooftop count wouldn't be.
      Added 20 new unit tests (both null-input edge cases, each gate's
      boundary condition, the AND-of-all-three `pass` computation, a zero/
      missing `roofNeed` not dividing by zero, ranking order across pass/short
      groups, ratio ties, a missing `ratio` sorting last within its group,
      non-mutation, empty/missing input). Verified: `python -m pytest -q` (15
      passed), `simy validate` (OK, unchanged — no `layers.yaml` touched),
      `node --test tests/js/*.test.mjs` (247 passed, 20 new), and headless
      Chromium confirms both `web/explore.html` and `web/index.html` still
      load with zero console/page errors (this item touches only
      `web/logic.js`/its tests — none of the 40+ existing per-use network-
      callback gates in `explore.html` were touched, so no existing single-use
      flow's behavior changed). This unblocks the next "Best fit here" step:
      wiring a "🏆 Best fit here" button that runs the underlying legs for
      every registered land use against the current point/parcel (reusing
      `standardUseVerdict` for the five uses above; the other six —
      data_center, residential_subdivision, fast_casual, ev_charging_hub,
      senior_living, hotel — keep their own bespoke leg math) and renders the
      `rankLandUseVerdicts`-ordered table; clicking a row switches Test-a-use
      to that use.
- [x] **11th land use: hotel / extended-stay lodging.** Added `hotel` to
      `data_sources/layers.yaml` — the first use whose demand read isn't a
      rooftop headcount at all: `requires.demand.min_demand_generators: 15`
      counts nearby hospitals/offices/event venues (Overpass
      `amenity=hospital`/`office=*`/`amenity=conference_centre`) within a 5 km
      radius, reusing `fast_casual`'s existing daytime-population-leg
      machinery (`cfg.daytimeQ`/`daytimeRadius`) generalized from
      fast_casual-only to `(current==="fast_casual"||current==="hotel")` —
      same query shape, different tags, no new plumbing. Also
      `requires.transportation.near_arterial_aadt: 15000` — the first new use
      since fast_casual/warehouse_club to consume the existing AADT
      traffic-count leg (`AADT_SOURCE`/`trafficLeg`, generalized the same way
      to include `current==="hotel"`), between fast_casual's arterial bar
      (20000) and warehouse_club's highway bar (40000). Plus
      `requires.parcel.min_buildable_acres: 1.5` (a parking-lot-sized floor)
      and the established "farther from existing hotels is better" competition
      read (`requires.competition.min_distance_km_from_nearest: 1.0`, the same
      `preferFar` pattern every use since `food_truck_court` has used, live
      query `tourism=hotel`/`tourism=motel`, unambiguous OSM tagging, no
      OR-fallback needed). `simy validate` confirms 11 land uses. Wired
      `maybeRenderHLVerdict` in `web/explore.html`, waiting on all four legs
      (generators, acreage, traffic, competitor-distance) — unlike every
      rooftop-headcount use, there's no single "no read at all" signal to hide
      the whole verdict block on, so it always renders once all four legs
      resolve (same as `data_center`'s pattern), with "?" text standing in for
      any one unavailable leg rather than hiding everything. No
      `reverseSearchSignals`/reverse-search UI changes needed — it already
      derives `preferFar` generically from `requires.competition`. Verified:
      `python -m pytest -q` (15 passed), `simy validate` (OK, 32 sources, 16
      layers, 11 land uses), `node --test tests/js/*.test.mjs` (229 passed, no
      logic.js changes needed since nothing new was added there), and headless
      Chromium: both pages load with zero console/page errors; selecting
      `hotel` shows the correct label and enables the reverse-search button
      with 2.5/5/10 km radius options (0.5x/1x/2x its own 5 km trade area) with
      "Nearest competitor" as the sort option (not "Nearby rooftops" — its
      `preferNear` signal is correctly off, since `roofNeed` is 0); a full
      simulated map click with `hotel` selected renders the whole result panel
      without throwing; driving `maybeRenderHLVerdict` directly through PASS /
      SHORT-on-generators / SHORT-on-acreage / SHORT-on-traffic /
      SHORT-on-competitor-too-close / PASS-with-a-distant-competitor /
      generators-unavailable / acreage-unavailable / traffic-unavailable /
      competitor-unavailable / no-NHS-route-in-range / wrong-use-selected-noop
      all produced correct verdict text and CSS classes with zero throws; and
      a mocked end-to-end reverse search (fake demand-generator points + one
      fake competitor hotel) returned 8 ranked candidates and rendered the
      results list/markers with zero console errors beyond the expected
      sandbox-blocked `ERR_TUNNEL_CONNECTION_FAILED` network errors. Outbound
      network to Overpass/ArcGIS is blocked from this sandbox, so a live
      end-to-end generator/traffic/competitor fetch on the real site is a good
      human spot-check.
- [x] **15th parcel county.** Added Franklin County, OH (Columbus) to
      `PARCEL_SOURCES` in `web/explore.html`, via the County Auditor's
      Esri-hosted "Tax Parcel" layer (`ParcelFeatures/Parcel_Features`,
      layer 0 — MapServer tried first, its sibling FeatureServer as
      fallback, same two-hostnames-one-layer shape Wake County already
      uses). Outbound network to ArcGIS hosts is blocked from this sandbox
      (like every prior county here), so field names and URLs were confirmed
      via WebSearch against independent search-indexed sources rather than a
      direct REST call: `PARCELID` (11-char id), `STATEDAREA` (legal acres),
      `ACRES` (GIS-measured acres) — owner name and situs address aren't
      published on this public boundary layer (same graceful
      partial-field-coverage as King/Cook/Salt Lake's thin schemas). The
      Auditor's per-parcel Datalet detail page needs an extra `jur`
      jurisdiction code not derivable from `PARCELID` alone, so — same
      cautious call as 9 prior counties with no confirmed deep-link shape —
      `record()` sends people to the Auditor's own parcel-ID search page
      instead of guessing a link. Zoning note is Ohio-specific and new
      among the 15: unlike every other state covered so far, Ohio
      *townships* (not the county) hold default zoning authority in
      unincorporated territory (ORC Ch. 519) unless a township's voters
      replaced it with county zoning (ORC Ch. 303), so the note points
      first to the township zoning office. `bbox` is a rough county extent
      from the county's known center/area (a pre-filter only, not exact —
      same harmless-slack tolerance as LA County's). Verified: `python -m
      pytest -q` and `simy validate` still pass (this change is pure
      client-side JS, doesn't touch `data_sources/*.yaml` or the compiled
      model), and headless Chromium confirms both `web/explore.html` and
      `web/index.html` load with zero console/page errors and a simulated
      map click still runs the full parcel flow without throwing. Live
      resolution of the new host (does the layer actually respond, do the
      field names match exactly) is unverified from this sandbox — worth a
      human spot-check on the live site, same caveat as the last several
      counties added this way.

## Next (breadth) — newly added (15)
- [x] **"Best fit here" step 2: the ranked results button + table.** Wired up
      the "🏆 Best fit here" button flagged as the natural next step when
      the shared `standardUseVerdict`/`rankLandUseVerdicts` core landed
      (`web/logic.js`) — the honestly-labeled **partial first cut** this
      item's own text anticipated: only the five uses whose
      `maybeRender*Verdict` reduces to *exactly* `standardUseVerdict`'s
      three-gate shape (rooftop demand + site size + farther-is-better
      competitor distance, nothing else) get ranked —
      `food_truck_court`/`urgent_care`/`self_storage`/`child_care_center`/
      `grocery_store` (`BEST_FIT_USES` in `web/explore.html`). The other
      seven (`data_center`, `warehouse_club`, `fast_casual`,
      `residential_subdivision`, `ev_charging_hub`, `senior_living`,
      `hotel`) each have at least one leg `standardUseVerdict` doesn't model
      (AADT traffic, a substation-distance gate, a median-age demand read,
      or no rooftop demand at all) — force-fitting them would silently
      misrepresent their real verdict math, so they're listed in a plain
      "not scored here" note instead, alongside any of the five that
      genuinely got no rooftop read at this point (e.g. a total Overpass
      outage). For the clicked point, fetches each of the five uses' own
      rooftop-count and competitor-scan Overpass queries (`bestFitLeg`) —
      same query text `runDemand` already issues for whichever one of the
      five is currently selected, through the same session-cached
      `overpassRaw`, so that use's own two legs come back as instant cache
      hits rather than a re-fetch; parcel acreage is shared across every use
      already (one parcel per clicked point) and read straight from
      `lastParcelSummary`, no extra fetch at all. Renders a ranked list
      (`rankLandUseVerdicts` order: passing first by comfortable margin,
      then short-by-least in the use-selector card's new "🏆 Best fit here"
      panel (mirrors the existing "🔍 Find candidate sites" toggle/panel
      pattern) — each row a label, PASS/SHORT badge, and one-line
      demand/site/competitor reason; clicking a row calls `selectUse` +
      `analyze(lastLatLng)` to switch Test-a-use to that land use and
      re-render its full single-use panel, then closes the best-fit panel.
      The button is disabled with a "Click a parcel first" title until
      `lastLatLng` is set, and the panel/results are cleared on every new
      point click (stale-result guard via its own `bfSeq` counter,
      independent of the single-point flow's `reqSeq` and the reverse-search
      flow's `searchReqSeq`) and on leaving Test-a-use mode. A total Overpass
      outage (all five uses' rooftop reads fail) shows a distinct "couldn't
      reach OpenStreetMap" state rather than an empty or fake result. No new
      pure logic needed in `logic.js` — `standardUseVerdict`/
      `rankLandUseVerdicts` already existed and were already tested from
      step 1, so `node --test`'s count is unchanged at 247. Verified:
      `python -m pytest -q` (15 passed), `simy validate` (OK, 32 sources, 16
      layers, 12 land uses). Verified in headless Chromium with a mocked
      `fetch`: both pages load with zero console/page errors; a real
      simulated map click + a real "🏆 Best fit here" button click rendered
      exactly 5 ranked rows with the correct pass/short badges and reason
      text; clicking the top-ranked row switched `current` to that use, ran
      a real `analyze()`, and closed the panel; selecting one of the five
      ranked uses (`grocery_store`) *before* clicking, so its own legs were
      already cached by the click's `runDemand()`, then opening the best-fit
      panel made measurably fewer new network calls than an uncached run
      would (confirming the cache-reuse claim isn't just asserted in a
      comment); and a simulated total-Overpass-failure run rendered the
      "couldn't reach OpenStreetMap" state with zero throws. Outbound
      network to Overpass is blocked from this sandbox, so a live end-to-end
      run on the real site (does the panel read well with all 5 uses'
      real-world data) is a good human spot-check. Ranking the other seven
      uses — either by extending `standardUseVerdict` to model their extra
      legs, or giving `rankLandUseVerdicts` a way to compare verdicts of
      different shapes — is a reasonable follow-up if wanted.
- [x] **12th land use: grocery store / supermarket.** Added `grocery_store`
      to `data_sources/layers.yaml` — rooftop demand within an 8 km trade area
      (`requires.demand.min_households_drive_time: 12000`, between
      fast_casual's 6 km/9k-rooftop restaurant crowd and warehouse_club's
      15 km/100k-rooftop citywide draw), `requires.parcel.min_buildable_acres:
      5.0` (a mid-box anchor + parking field, smaller than warehouse_club's
      15-acre big-box pad), and the established "farther from existing
      supermarkets is better" competition read
      (`requires.competition.min_distance_km_from_nearest: 2.0`, live query
      `shop=supermarket` — unambiguous OSM tagging, no OR-fallback needed).
      `simy validate` confirms 12 land uses. Wired `maybeRenderGSVerdict` in
      `web/explore.html` (`USE_DEMAND.grocery_store`, `gsState`, the `order`/
      `isXX` lists, the rooftop/competitor-distance network callbacks in
      `runDemand`, the acreage callback in `showParcel`) following the
      `food_truck_court`/`hotel` pattern — but this is the **first land use
      to actually call the shared `standardUseVerdict`** (`web/logic.js`,
      landed but unused in "Best fit here" step 1) instead of duplicating its
      three-gate demand/site-size/competitor-distance math inline, since
      grocery_store's requires shape is exactly what that helper models.
      No `reverseSearchSignals`/reverse-search UI changes needed — it already
      derives `preferFar`/`preferNear` generically from `requires.competition`
      and `roofNeed`. No new pure logic landed in `logic.js` itself (just a
      new caller of the existing `standardUseVerdict`), so `node --test`'s
      count is unchanged at 247. Verified: `python -m pytest -q` (15 passed),
      `simy validate` (OK, 32 sources, 16 layers, 12 land uses), `node --test
      tests/js/*.test.mjs` (247 passed, unchanged), and headless Chromium:
      both pages load with zero console/page errors; selecting `grocery_store`
      shows the correct label, enables "🔍 Find candidate sites" with 4/8/16 km
      radius options (0.5x/1x/2x its own 8 km trade area — `preferFar`/
      `preferNear` both correctly on), and a simulated map click renders the
      full result panel without throwing; driving `maybeRenderGSVerdict`
      directly through PASS / PASS-with-no-competitor-in-range /
      SHORT-on-demand / SHORT-on-acreage / SHORT-on-competitor-too-close /
      acreage-unavailable / no-rooftop-read (verdict block correctly hidden)
      / competitor-lookup-error / wrong-use-selected-noop all produced
      correct verdict text, CSS classes, and display state with zero throws.
      Outbound network to Overpass/ArcGIS is blocked from this sandbox, so a
      live end-to-end rooftop/competitor fetch on the real site is a good
      human spot-check, same caveat as every prior live-data land use added
      this way.
- [x] **16th parcel county.** Added Tarrant County, TX (Fort Worth/Arlington) as
      a 16th `PARCEL_SOURCES` entry — the Tarrant Appraisal District's
      `mapit.tarrantcounty.com` ArcGIS `Tax/TCProperty/MapServer/0` layer
      (found via WebSearch since this sandbox blocks direct ArcGIS REST
      introspection, same constraint every prior county hit). Confirmed field
      names via multiple independent search-indexed sources: `TAXPIN` (parcel
      id, added to the shared `pick()` id list), `OWNER_NAME`, `SITUS_ADDR`
      (both already covered by the shared owner/address lists), `LAND_ACRES`
      (added to the acreage list), `ACCOUNT`, and `TOTAL_VALU` (added to the
      value list). No confirmed land-use/property-type field — the layer's
      other fields (`LIVING_ARE`/`BEDROOMS`/`BATHROOMS`/`SW_POOL`) read as
      residential-appraisal columns rather than a generic use code, so land
      use is left unmapped, same graceful partial-field-coverage as
      Dallas/Fulton. Unlike most prior counties, TAD *does* publish a
      confirmed per-account deep link (`tad.org/property?account=<ACCOUNT>`,
      independently confirmed via search-indexed results including a live
      `?account=0` example page), so `record()` builds a real per-parcel URL
      instead of falling back to a search page. Tarrant is a TX county, so it
      reuses the "TX counties don't zone" `zoning_note`. Verified: `python -m
      pytest -q` (15 passed), `simy validate` (OK, 32 sources, 16 layers, 12
      land uses), `node --test tests/js/*.test.mjs` (247 passed, unchanged —
      this item touches only inline `PARCEL_SOURCES` data/pick() lists in
      `explore.html`, no new pure `logic.js` helpers). Verified in headless
      Chromium: both pages load with zero console/page errors; `inBbox`
      correctly routes a downtown-Fort-Worth point to the new source, still
      finds Dallas County's own source for a Dallas-side point (no bbox
      cross-contamination), and correctly finds no source for an
      out-of-coverage point (Denver); driving `showParcel` directly with a
      mocked Tarrant ArcGIS attribute payload (including an empty-attributes
      edge case) rendered correctly and didn't throw; and a real end-to-end
      `analyze()` click at a Fort Worth point with a mocked `fetch` response
      rendered parcel ID/owner/address/acreage/appraised-value and the
      correct `tad.org/property?account=…` record link, all with zero
      console errors. Live ArcGIS endpoint reachability (the exact field
      values on real parcels) couldn't be confirmed from this sandbox — a
      live spot-check is a good human follow-up, same as every prior county.

## Next (breadth) — newly added (16)
- [x] **Multi-tract Census ACS trade area for `grocery_store`.** The
      "🏘️ Trade-area demographics (ACS)" checklist row was gated on
      `AMENITY_USES.has(current)||current==="senior_living"` (`web/explore.html`,
      near the `devCensusTA` block) — a hand-picked list from when only
      `fast_casual`/`warehouse_club` (and later `senior_living`) had a
      multi-km rooftop trade area worth sampling. `grocery_store` (added
      later, `USE_DEMAND.grocery_store.radius: 8000`, `roofNeed: 12000`) meets
      the exact same "large multi-km trade area with real rooftop demand"
      criterion but was never added to the gate, so it was the one land use
      with a genuine trade area missing this row. Added `current==="grocery_store"`
      to the condition in both places it appears — the row's visibility check
      and the `runCensusTradeArea` call guard — without touching `AMENITY_USES`
      itself (that set also drives an unrelated "amenity_seeker" persona-scoring
      bonus in `web/logic.js` that didn't need to change for this). Verified:
      `python -m pytest -q` (15 passed), `simy validate` (OK, 32 sources, 16
      layers, 12 land uses), `node --test tests/js/*.test.mjs` (247 passed,
      unchanged — this item is pure gate-condition wiring in `explore.html`,
      no new pure `logic.js` helpers). Verified in headless Chromium: both
      pages load with zero console/page errors; a real end-to-end `analyze()`
      run (mocking only the ArcGIS parcel point-query so `showParcel` executes
      instead of taking the network-fail path) with `grocery_store` selected
      now renders the "🏘️ Trade-area demographics (ACS)" row and calls
      `runCensusTradeArea`; `data_center` (no trade area) correctly still
      shows neither; and `warehouse_club` (pre-existing `AMENITY_USES` member)
      is unregressed — still shows both. Outbound network to
      `geo.fcc.gov`/`api.census.gov` is blocked from this sandbox, so a live
      spot-check that the row actually populates on the real site is a good
      human follow-up, same caveat as the original multi-tract ACS item.
- [x] **"Best fit here" step 3, part 1: add an AADT traffic-count gate +
      `warehouse_club`.** Step 2 ranked only the five uses whose verdict
      reduces exactly to `standardUseVerdict`'s three-gate shape (rooftop
      demand + site size + farther-is-better competitor distance).
      `warehouse_club`'s real verdict (`maybeRenderWCVerdict`) is that same
      shape plus one more leg — a real AADT traffic-count read via the
      existing `AADT_SOURCE` ArcGIS layer/`maxAadtWithinRadius`
      (`web/logic.js`), no competitor gate at all. Added an optional
      `minAadt` gate to `standardUseVerdict` (`reads.aadtHit`/`aadtErr`,
      `thresholds.minAadt` — skipped/trivially-true when omitted, same
      pattern as `minAcres`/`minCompetitorKm`; a lookup error or no NHS route
      in range both fail the gate, same "closer/busier is better, no read is
      a gap" contract as the existing inline `trafficLeg` helper, unlike the
      farther-is-better competitor gate). `bestFitLeg` (`web/explore.html`)
      now takes the whole `BEST_FIT_USES` entry (not just the use key) and
      fetches AADT via the same `arcgisNearQuery`/`maxAadtWithinRadius` call
      `runDemand`'s own traffic leg uses, in parallel with the existing
      rooftop/competitor Overpass fetches, skipped entirely for uses without
      a `minAadt` threshold. `bestFitReasonText` now builds its gate list
      conditionally (demand always shown; site/AADT/competitor lines only
      when that use actually has the matching threshold) instead of always
      assuming all three original legs apply — `warehouse_club` no longer
      gets a misleading "✓ no existing competitor in range" line for a gate
      it doesn't actually check. `warehouse_club` added to `BEST_FIT_USES`.
      Verified: `python -m pytest -q` (15 passed), `simy validate` (OK, 32
      sources, 16 layers, 12 land uses), `node --test tests/js/*.test.mjs`
      (252 passed, 5 new — the AADT gate's skip/pass/fail/error/AND-with-
      other-gates cases, plus one existing exact-shape assertion updated for
      the new `aadtOk` key). Verified in headless Chromium: both pages load
      with zero console/page errors; driving `bestFitLeg`/`standardUseVerdict`
      directly with mocked Overpass (rooftops) and ArcGIS (AADT) responses
      confirmed the full fetch→verdict pipeline (PASS when demand/site/AADT
      all clear, flips to SHORT when AADT alone drops below the floor); and a
      real end-to-end `analyze()` + `runBestFit()` run rendered
      `warehouse_club` in the ranked panel with the new AADT reason line and
      no competitor line, while the "not scored here" note correctly dropped
      from 7 uses to the remaining 6. Live Overpass/ArcGIS reachability
      wasn't tested (sandbox blocks outbound), same caveat as every prior
      live-read item.
- [x] **"Best fit here" step 3, part 2: add a substation-distance gate +
      `ev_charging_hub`.** Same shape as part 1's AADT gate, for the one
      remaining use whose verdict (`maybeRenderEVVerdict`) is
      `standardUseVerdict`'s rooftop-demand + farther-is-better competitor
      read plus exactly one extra leg — the nearest-substation distance
      (`power.prefer_substation_within_km: 3`) — and no acreage gate at all.
      Added an optional `maxSubstationKm` gate to `standardUseVerdict`
      (`reads.subKm`/`subErr`, `thresholds.maxSubstationKm` — skipped/
      trivially-true when omitted, same pattern as `minAcres`/
      `minCompetitorKm`/`minAadt`). It reads *nearer is better*, like the
      AADT gate and unlike the competitor gate: a lookup error or no
      substation within range both fail it, since a charging hub with no
      mapped grid capacity nearby is a real siting gap, not the best case
      the way "no competitor in range" is. `bestFitLeg` (`web/explore.html`)
      now fetches the nearest substation via the same `USE_DEMAND.powerQ`
      Overpass query runDemand's own power leg uses, through the same
      session-cached `overpassRaw`, in parallel with the existing rooftop/
      competitor/AADT fetches and skipped entirely for uses without a
      `maxSubstationKm` threshold (confirmed: scoring `grocery_store` issues
      its 2 usual queries and zero substation queries). Parsing reuses the
      existing `parseOverpassPoints` helper rather than re-inlining the
      node-vs-way element-shape handling. `bestFitReasonText` gained a
      matching conditional substation line. Verified: `python -m pytest -q`
      (15 passed), `simy validate` (OK, 32 sources, 16 layers, 12 land uses),
      `node --test tests/js/*.test.mjs` (257 passed, 5 new — the substation
      gate's skip/no-substation/at-vs-beyond-the-ceiling/lookup-error/
      AND-with-other-gates cases, plus the existing exact-shape assertion
      updated for the new `subOk` key). Verified in headless Chromium: both
      pages load with zero genuine console/page errors; driving
      `bestFitLeg`/`standardUseVerdict` with mocked Overpass responses
      confirmed the full fetch→verdict pipeline (PASS at a 0.3 km
      substation, flipping to SHORT on `subOk` alone at 7.0 km, and the
      `? substation distance unavailable` line on a rejected power query);
      and a real end-to-end `runBestFit()` rendered `ev_charging_hub` ranked
      #1 with its substation reason line and no site-size line, while the
      "not scored here" note correctly dropped from 6 uses to the remaining
      5. Live Overpass reachability wasn't tested (sandbox blocks outbound),
      same caveat as every prior live-read item.
- [x] **"Best fit here" step 3, part 3: score `fast_casual`, `senior_living`,
      and `hotel` via a precomputed demand-ratio override.** These three were
      the only remaining uses whose *gates* fit `standardUseVerdict`'s shared
      shape but whose *demand* leg wasn't a raw rooftop count —
      `standardUseVerdict` (`web/logic.js`) hard-coded `roofs/roofNeed` as the
      ratio. Generalized it to accept an optional precomputed `reads.demand`
      — any `{ratio,pass}`-shaped object (the exact return shape
      `blendedDemand`/`seniorDemandRead` already produce) — used as-is
      instead of being derived from `roofs`/`roofNeed`; omitting it keeps the
      original rooftop-ratio behavior verbatim, so every existing caller/test
      is unaffected. Added `countDemandRead(count,need)` for hotel's shape —
      unlike every ratio-based demand read, `maybeRenderHLVerdict`'s real bar
      is `count>=need` outright with no 0.85-of-need fuzz, so this
      deliberately doesn't reuse blendedDemand/seniorDemandRead's pass
      formula even though it returns the same `{ratio,pass}` shape. Each
      `BEST_FIT_USES` entry now carries an optional `demandKind`
      (`"blended"`/`"senior"`/`"generators"`) that tells `bestFitLeg`
      (`web/explore.html`) which reads to fetch and which pure function to
      compute `demand` from: `fast_casual`/`hotel` reuse the exact
      `cfg.daytimeQ` Overpass query `runDemand`'s own daytime leg already
      issues (fetched only when `demandKind` is set, same skip-when-unneeded
      pattern the AADT/substation legs established); `senior_living` reuses
      the multi-tract FCC→ACS sample-and-aggregate pipeline the "🏘️
      Trade-area demographics" row already has, factored out into a new
      `bestFitMedianAge(lat,lng,radiusKm)` that resolves to a value instead
      of writing the DOM, so "Best fit here" can read it regardless of
      whether that row is open or senior_living is even the selected use.
      `data_center` (water-district boolean gate, no shared-gate analogue)
      and `residential_subdivision` (acreage is a demand *input*, not a
      separate site-size gate) still don't fit this shape — split out below
      as the remaining follow-up. Added 9 new unit tests (`reads.demand`
      overriding the rooftop ratio, `demand===null` propagating to an overall
      null verdict, a precomputed `pass` being honored below the 85% bar,
      old behavior preserved when `demand` is omitted, `demand` still ANDing
      with the other gates; `countDemandRead`'s null/flat-floor/ratio/
      zero-need cases). Verified: `python -m pytest -q` (15 passed), `simy
      validate` (OK, 32 sources, 16 layers, 12 land uses), `node --test
      tests/js/*.test.mjs` (266 passed, 9 new). Verified in headless
      Chromium: both pages load with zero console/page errors; drove
      `bestFitLeg` directly for all three new uses with mocked Overpass/FCC/
      ACS responses, confirming each computed the correct `demand` shape
      (blended ratio, median-age ratio, generator-count ratio); and a real
      end-to-end `runBestFit()` run with mocked network ranked all 10
      shared-shape uses together (fast_casual/senior_living/hotel now scored
      alongside the original 7), correctly showed hotel's own exact-count
      pass bar failing at a ratio the default 0.85 rule would have passed,
      and left only Data Center/Residential Subdivision in the "not scored
      here" note — down from 5. Live Overpass/FCC/Census reachability wasn't
      tested (sandbox blocks outbound), same caveat as every prior live-read
      item.
- [x] **"Best fit here" step 3, part 4: score the last 2 land uses
      (`data_center`, `residential_subdivision`).** The two final holdouts —
      `standardUseVerdict` (`web/logic.js`) gained a `requireDistrict`
      threshold + `reads.mud` gate for data_center's water-district leg
      (`mudOk = requireDistrict ? mud===true : true` — a 3-state `mud`
      matching `maybeRenderDCVerdict`'s own `s.mud` contract exactly: `true`
      inside a district, `false` queried-and-not-inside, `null` either
      no-districts-layer-for-this-area or every candidate host failed, and
      `null` reads as a fail here just like `false`). `bestFitLeg`
      (`web/explore.html`) gained a matching `bestFitDistrict(lat,lng)` — the
      same `DISTRICT_SOURCES`/`arcgisPointQuery` per-host fallback chain
      `runDistricts`/`tryDistrict` already use for the live developer
      checklist, factored out to resolve a plain value instead of writing the
      DOM or gating on `reqSeq`/`dcState`, so it can run for a use that isn't
      necessarily selected/clicked. data_center's substation leg turned out
      to need *zero* new fetches: its own `USE_DEMAND.compQ` is already a
      power-substation query (not a competitor query), so `bestFitLeg` now
      derives `subKm` from the same `compP` leg every use already fetches
      instead of a separate `powerQ` call, mirroring how
      `maybeRenderDCVerdict` derives `dcState.subKm` from `runDemand`'s own
      compQ leg. data_center's demand leg is the trivial always-true
      `{ratio:1,pass:true}` a new `demandKind:"trivial"` selects (its "need"
      is fully captured by the substation/acreage/water gates, not a separate
      demand leg). Added a pure
      `schoolLoadDemandRead(acres,schools,unitsPerAcre,studentsPerHome,seatsPerSchool)`
      to `web/logic.js` for residential_subdivision — mirrors
      `maybeRenderResVerdict`'s own projection math exactly (units = acres ×
      3/ac, kids = units × 0.5/home, capacity = schools × 750 seats), fed
      through the same `reads.demand` override step 3, part 3 added; a new
      `demandKind:"schoolLoad"` selects it in `bestFitLeg`, reusing the
      already-fetched competitor-scan *count* (residential_subdivision's own
      `compQ` is a school-count query) — no new fetch there either, just a
      new `count` field on the existing `compP` leg's return shape. Zero
      induced kids reads as `ratio:null` (no meaningful margin to report,
      `pass` still true) rather than a divide-by-zero, same contract
      `countDemandRead`'s zero-need case already established. Both
      `BEST_FIT_USES` entries now carry the real thresholds
      `maybeRenderDCVerdict`/`maybeRenderResVerdict` use
      (`DC_MIN_ACRES`/`DC_SUB_KM`/`requireDistrict` for data_center, nothing
      but `demandKind` for residential_subdivision — a genuinely gate-less
      use). Added 10 new unit tests (the water-district gate's skip/
      unknown-fails-like-false/false/true/AND-with-other-gates cases, plus
      `schoolLoadDemandRead`'s null-acres/null-schools/real-projection-math/
      boundary-pass/zero-kids-null-ratio cases) and updated the existing
      exact-return-shape assertion for the new `mudOk` key. Verified: `python
      -m pytest -q` (15 passed), `simy validate` (OK, 32 sources, 16 layers,
      12 land uses), `node --test tests/js/*.test.mjs` (276 passed, 10 new).
      Verified in headless Chromium: both pages load with zero console/page
      errors; drove `standardUseVerdict`/`bestFitDistrict`/`bestFitReasonText`
      directly through data_center's PASS / mud-false / mud-unknown states
      with correct `mudOk`/reason text each time; drove `bestFitLeg` directly
      for both new uses with a mocked Overpass/ArcGIS `fetch`, confirming
      data_center's `subKm` came from the shared compQ leg (no separate power
      query) and residential_subdivision's `demand` matched the hand-computed
      school-load math; confirmed `BEST_FIT_USES` now covers all 12
      `ALL_USE_KEYS` so the "not scored here" note's filter list is
      permanently empty; and a real end-to-end `runBestFit()` run (mode
      switched to Test-a-use, a mocked point/parcel, mocked network) rendered
      all uses ranked with data_center showing "✓ substation 0.1 km away · ✓
      inside a mapped water district" and residential_subdivision showing its
      real demand percentage — both PASS, zero throws. Live Overpass/ArcGIS
      reachability wasn't tested (sandbox blocks outbound), same caveat as
      every prior live-read item.
- [x] **17th parcel county.** Added Hennepin County, MN (Minneapolis) as a
      17th `PARCEL_SOURCES` entry — `gis.hennepin.us`'s "County Parcels"
      layer (`HennepinData/LAND_PROPERTY/MapServer/1`), found via WebSearch
      since this sandbox blocks direct ArcGIS REST introspection, same
      constraint every prior county hit. Confirmed fields (via multiple
      independent search-indexed sources): `PID` (13-char parcel id),
      `OWNER_NM` (owner), `ACRES_POLY`/`ACRES_DEED` (acreage), `EMV_TOTAL`
      (estimated market value) — added all four to the shared `pick()`
      candidate lists. Land use and situs address weren't confirmed on this
      specific layer (address lives on a separate `MetroGIS Parcel
      Addresses` layer — mixing two ArcGIS layers into one point query is
      out of scope for the shared single-layer `pick()` pattern), so — same
      graceful partial-field-coverage as Dallas/Fulton/Salt Lake/Franklin —
      left unmapped rather than guessed. Unlike most prior counties, Hennepin
      *does* publish a confirmed per-PID deep link
      (`www16.co.hennepin.mn.us/pins/pidresult.jsp?pid=<PID>`), so `record()`
      builds a real per-parcel URL instead of falling back to a search page.
      Hennepin County has almost no unincorporated land left (all 45
      municipalities set their own zoning, and the county's last remaining
      township has been annexing into cities), so it got its own
      `zoning_note` rather than reusing another state's. Verified: `python -m
      pytest -q` (15 passed), `simy validate` (OK, 32 sources, 16 layers, 12
      land uses), `node --test tests/js/*.test.mjs` (247 passed, unchanged —
      this item touches only inline `PARCEL_SOURCES` data/`pick()` lists in
      `explore.html`, no new pure `logic.js` helpers). Verified in headless
      Chromium: both pages load with zero console/page errors; `inBbox`
      correctly routes a downtown-Minneapolis point to the new source, still
      finds Cook County's own source for a Chicago-side point (no
      cross-contamination), and correctly finds no source for St. Paul
      (Ramsey County, just outside Hennepin's bbox) or an out-of-coverage
      point (Denver); driving `record()`/`pick()` directly with a mocked
      Hennepin ArcGIS attribute payload (including an empty-attributes edge
      case) produced the correct deep link and parsed fields; and a real
      end-to-end `analyze()` + `showParcel()` run at a Minneapolis point with
      a mocked ArcGIS response rendered parcel ID/owner/acreage/
      appraised-value and the correct `pidresult.jsp?pid=…` record link, all
      with zero console errors. Live ArcGIS endpoint reachability (the exact
      field values on real parcels) couldn't be confirmed from this sandbox
      — a live spot-check is a good human follow-up, same as every prior
      county.

## Now (high value) — newly added
- [x] **Installable PWA (web app manifest + icons).** Added `web/manifest.json`
      (name/short_name "SIMyCity", `start_url: "explore.html"`, `scope: "."`,
      `display: "standalone"`, `theme_color`/`background_color` both
      `#16201f` — the same dark ink the existing favicon SVG already uses as
      its background). Rasterized that exact favicon SVG (the rounded dark
      square + green "S" mark) into real PNGs — `web/icons/icon-192.png`,
      `icon-512.png`, and `icons/apple-touch-icon.png` (180×180) — via
      headless Chromium (no PIL/cairosvg available in this sandbox, so used
      the pre-installed Playwright Chromium to screenshot the SVG at each
      target size with a transparent background instead), so no new art
      asset was hand-drawn — it's a pixel-accurate render of the existing
      mark. Linked from both `web/explore.html` and `web/index.html`:
      `<link rel="manifest">`, `<meta name="theme-color">`, and
      `<link rel="apple-touch-icon">` (iOS ignores manifest icons and needs
      its own tag), inserted right next to the existing favicon `<link>` in
      each `<head>`. Verified: `manifest.json` parses as valid JSON with all
      required fields; fetching it and each referenced icon via a real
      Chromium `file://` navigation returned HTTP 200 with correct PNG magic
      bytes at the expected byte sizes (no 404s, no broken references); and
      both pages load with zero console/page errors in headless Chromium
      (a missing/malformed manifest would surface as a DevTools console
      warning, which this check would have caught).
- [x] **Open Graph / Twitter Card meta tags for shareable links.** Added
      static `og:type`/`og:url`/`og:title`/`og:description`/`og:image` and
      `twitter:card`/`twitter:title`/`twitter:description`/`twitter:image`
      tags to both `web/index.html` and `web/explore.html` `<head>`s, right
      after the existing manifest/theme-color/apple-touch-icon tags — each
      page gets its own title/description matching its existing tagline
      copy, both pointing `og:image`/`twitter:image` at the already-committed
      `web/hero.png` via its absolute GitHub Pages URL
      (`https://jodeit.github.io/simy_city/hero.png`) and `twitter:card` set
      to `summary_large_image`. Documented inline (as an HTML comment above
      the tags on both pages) the real scoping limit: this is a
      client-side-only app with no server, so a shared permalink to a
      *specific* pinned site (`#mode=…&lat=…&lng=…`/`#cmp=…`) can't get a
      dynamically-generated per-site preview — only a solid static default
      preview for the site as a whole, not per-permalink previews. Verified:
      `hero.png` is a real committed 243,999-byte file (not a placeholder);
      a headless-Chromium `file://` load of both pages confirms the new meta
      tags are present with the exact expected `content` values via
      `document.querySelector`; and both pages still load with zero genuine
      page/console errors (the sandbox's expected
      `net::ERR_TUNNEL_CONNECTION_FAILED`/"Failed to load resource" noise
      from unreachable external tile/Overpass hosts is filtered out of that
      check, same caveat as every prior item touching these pages —
      `python -m pytest -q` (15 passed), `simy validate` (OK, 12 land uses),
      and `node --test tests/js/*.test.mjs` (276 passed) all stayed green
      since this item touched only the two pages' `<head>`s.
- [x] **13th land use: Car Wash.** Added `car_wash` to `data_sources/layers.yaml`
      (`requires.demand: {min_households_drive_time: 7000, drive_time_min: 8}`,
      `requires.transportation: {near_arterial_aadt: 25000}`,
      `requires.parcel: {min_buildable_acres: 1.0}`,
      `requires.competition: {min_distance_km_from_nearest: 1.5}`) — a clean
      fit for the shared `standardUseVerdict` gate machinery
      (rooftop demand + site-size + AADT traffic-count + farther-is-better
      competitor-distance) with **zero new gate-shape work needed** in
      `web/logic.js`, same as grocery_store. Wired `web/explore.html` end to
      end: `"car_wash"` added to `ALL_USE_KEYS`; a `USE_DEMAND.car_wash` entry
      (5 km radius, 7,000-rooftop need, `compQ` ORs `shop=car_wash` and
      `amenity=car_wash` — ambiguous OSM tagging, same OR-fallback
      urgent_care/child_care_center's messy tag landscape already required);
      `CW_MIN_ACRES`/`CW_AADT_MIN`/`CW_MIN_COMPETITOR_KM` constants and a
      `cwState` fan-out slot wired into `analyze()`'s per-use state
      init/reset, `runDemand()`'s rooftop/AADT/competitor legs (added
      `car_wash` to the shared AADT-leg condition warehouse_club/
      fast_casual/hotel already used), and `showParcel`'s acreage leg; a
      `maybeRenderCWVerdict` render function that — unlike warehouse_club/
      hotel's inline `trafficLeg` text duplication — calls `standardUseVerdict`
      directly with `minAadt` set, the first inline (non-`BEST_FIT_USES`)
      verdict to do so; and a `BEST_FIT_USES` entry
      (`minAcres`/`minAadt`/`minCompetitorKm`) so "Best fit here" ranks it
      alongside the other 12 for free, no `runBestFit`/`bestFitLeg` changes
      needed. Verified: `python -m pytest -q` (15 passed), `simy validate`
      (OK, 13 land uses), `node --test tests/js/*.test.mjs` (276 passed,
      unchanged — no new pure logic.js functions needed since
      `standardUseVerdict` already covered this exact shape). In headless
      Chromium: both pages load with zero console/page errors; selecting
      `car_wash` and driving `maybeRenderCWVerdict` directly through PASS /
      SHORT-on-demand / SHORT-on-site-size / SHORT-on-AADT /
      SHORT-on-competitor-too-close / acreage-unavailable / no-AADT-route /
      AADT-lookup-error / competitor-scan-error / no-rooftop-read /
      wrong-use-selected all produced correct verdict text and CSS classes
      with zero throws; a real simulated map click with `car_wash` selected
      rendered the full result panel end to end without throwing; and
      `car_wash` is confirmed present in both `ALL_USE_KEYS` and
      `BEST_FIT_USES`. Live Overpass/ArcGIS reachability isn't testable from
      this sandbox, same caveat as every prior land-use/county item — a
      human spot-check on the live site is worthwhile.
- [x] **14th land use: Pharmacy / Drugstore.** Added `pharmacy` to
      `data_sources/layers.yaml` with the same standard gate shape car_wash/
      grocery_store already use: `requires.demand`
      (`min_households_drive_time: 8000, drive_time_min: 8`),
      `requires.transportation.near_arterial_aadt: 25000` (same threshold
      car_wash's arterial-frontage gate uses), `requires.parcel.
      min_buildable_acres: 1.5` (a small pad site, not a big-box lot), and
      `requires.competition.min_distance_km_from_nearest: 1.0` (avoiding the
      CVS-across-from-Walgreens saturation pattern). Needed **zero** new
      gate-shape work in `web/logic.js` — `standardUseVerdict` already
      covered this exact demand+AADT+acreage+competitor-distance combination
      (car_wash proved it), confirmed by `node --test tests/js/*.test.mjs`
      staying at 276 passed, unchanged. Wired `web/explore.html` the same way
      car_wash was wired: `ALL_USE_KEYS`, a `USE_DEMAND.pharmacy` entry
      (`compQ` ORs `shop=chemist`/`amenity=pharmacy`/`healthcare=pharmacy` —
      OSM tags this inconsistently, same messy-tag OR-fallback urgent_care/
      car_wash needed), `PH_MIN_ACRES`/`PH_AADT_MIN`/`PH_MIN_COMPETITOR_KM`
      constants and a `phState` fan-out slot wired into `analyze()`'s
      per-use state init/reset, `runDemand()`'s rooftop/AADT/competitor legs
      (added `pharmacy` to the shared AADT-leg condition car_wash/
      warehouse_club/fast_casual/hotel already used), and `showParcel`'s
      acreage leg; a `maybeRenderPHVerdict` render function that calls
      `standardUseVerdict` directly (same non-duplicating shape car_wash's
      `maybeRenderCWVerdict` established); and a `BEST_FIT_USES` entry
      (`minAcres`/`minAadt`/`minCompetitorKm`) so "Best fit here" ranks it
      alongside the other 13 for free, no `bestFitLeg` changes needed (it's
      already fully data-driven off `USE_DEMAND`/`BEST_FIT_USES`). Verified:
      `python -m pytest -q` (15 passed), `simy validate` (OK, 14 land uses),
      `node --test tests/js/*.test.mjs` (276 passed, unchanged). In headless
      Chromium: both pages load with zero console/page errors; selecting
      `pharmacy` and driving `maybeRenderPHVerdict` directly through PASS /
      SHORT-on-demand / SHORT-on-site-size / SHORT-on-AADT /
      SHORT-on-competitor-too-close / acreage-unavailable / no-AADT-route /
      AADT-lookup-error / competitor-scan-error / no-rooftop-read /
      wrong-use-selected all produced correct verdict text and CSS classes
      with zero throws; a real simulated map click with `pharmacy` selected
      rendered the full result panel end to end without throwing; and
      `pharmacy` is confirmed present in `ALL_USE_KEYS`, `USE_DEMAND`, and
      `BEST_FIT_USES`. Live Overpass/ArcGIS reachability isn't testable from
      this sandbox, same caveat as every prior land-use item — a human
      spot-check on the live site is worthwhile.
- [x] **18th parcel county: Clark County, NV (Las Vegas).** Added a
      `PARCEL_SOURCES` entry for the Clark County Assessor's `GISMO/
      AssessorMap` MapServer (layer 1, "Parcels" — layer 0 is Lotlines, 2 is
      Easements; found via WebSearch since this sandbox can't introspect
      ArcGIS REST endpoints directly). Confirmed fields from search-indexed
      docs: `APN` (already in the shared id candidate list), `CALC_ACRES`/
      `ASSR_ACRES` (newly added to the acreage list), and `PARCELTYPE` (newly
      added to the land-use list) — owner name, situs address, and appraised
      value weren't independently confirmed on this public boundary layer, so
      left unmapped rather than guessed, same graceful partial-field-coverage
      as King/Cook/Salt Lake/Franklin. No confirmed per-APN deep-link URL
      scheme for the Assessor's Real Property Records search turned up, so —
      same cautious call as Harris/Bexar/LA/King/etc. — `record()` links to
      the search page instead. Nevada counties do zone unincorporated land
      (unlike TX), and Clark County's unincorporated area notably includes
      the Las Vegas Strip itself (in unincorporated Paradise, NV) — captured
      in a new `zoning_note` rather than reusing the TX/other-state copy.
      Verified: `python -m pytest -q` (15 passed), `simy validate` (OK, 32
      sources unchanged — this only touches `web/explore.html`), `node --test
      tests/js/*.test.mjs` (276 passed, unchanged — no new pure helpers were
      needed here). In headless Chromium: both pages load with zero console/
      page errors; `inBbox` correctly routes a Las-Vegas-Strip point to the
      new Clark County source and still finds no source for an
      out-of-coverage point (Denver); and a real simulated map click
      (`analyze()`) with `fetch` mocked to return a Clark-County-shaped
      ArcGIS payload (`APN`/`CALC_ACRES`/`PARCELTYPE`) rendered the full
      result panel end to end — correct Parcel ID, Land use, Acreage,
      zoning-note text, and record link — with zero console/page errors.
      Live ArcGIS endpoint reachability (exact layer index, real APN format)
      couldn't be confirmed from this sandbox — a live spot-check is a good
      human follow-up, same as every prior county.
- [x] **CSV export for reverse-search candidate results.** Duplicate of the
      item already shipped and checked off above (line ~1133): the
      reverse-search results panel already has a "⬇️ Download CSV" button
      (`downloadCandidatesCsv()` in `web/explore.html`, backed by
      `candidatesToCsvRows()`/`toCsv()` in `web/logic.js`, with unit tests in
      `tests/js/model-logic.test.mjs`), plus PDF and GeoJSON exports added
      alongside it in later runs. This copy was a stale re-add — closing it
      out rather than re-implementing an existing feature. No code change
      this run; verified the existing implementation still works: `pytest`
      (15 passed), `simy validate` (OK, 32 sources/14 land uses), `node
      --test tests/js/*.test.mjs` (276 passed), and headless Chromium
      confirms both `web/explore.html` and `web/index.html` still load with
      zero genuine console/page errors.

## Now (high value) — newly added (3)
- [x] **15th land use: Urgent Care Clinic.** Already fully implemented in an
      earlier run under a different pass (not checked off at the time):
      `urgent_care` is registered in `data_sources/layers.yaml` (rooftop
      demand at a 3 km radius, `min_buildable_acres: 1.0`, a
      `min_distance_km_from_nearest: 2.0` inverted competition gate against
      `amenity=clinic|healthcare=clinic`) and has a real
      `maybeRenderUCVerdict` PASS/SHORT wired up in `web/explore.html`,
      same wait-for-all-legs pattern as every other land-use verdict.
      Checked off as a bookkeeping fix this run — confirmed present in both
      `data_sources/layers.yaml`/`web/model.js` (14 land uses total,
      `simy validate` passes) and `web/explore.html`'s
      `maybeRenderUCVerdict`/`ucState` wiring; no new code needed.
- [x] **One more parcel county: Fulton County, GA (Atlanta).** Already fully
      implemented in an earlier run under a different pass (not checked off
      at the time): Fulton County GIS
      (`gismaps.fultoncountyga.gov`'s PropertyMapViewer MapServer layer 11)
      is present in `PARCEL_SOURCES` with confirmed `ParcelID`/`Owner`/
      `Address` fields, land use/acreage/value left unmapped (unconfirmed),
      a Georgia-specific `zoning_note` (unincorporated land mostly absorbed
      by cityhood incorporations through 2021), and a `record()` link to the
      qPublic search page. Checked off as a bookkeeping fix this run —
      confirmed present in `web/explore.html`; no new code needed.
- [x] **Acres/hectares/sq ft unit toggle for parcel size.** Added a small
      cycling "ac / ha / sq ft" button to the header (`#unitToggle`, next to
      the existing dark-mode toggle), persisted to `localStorage`
      (`simy_unit`, same pattern as `simy_theme`), and a pure
      `formatArea(acres, unit)`/`convertArea(acres, unit)`/`areaUnitLabel(unit)`
      trio in `web/logic.js` (acres → hectares ×0.404686, 2 decimals; acres
      → sq ft ×43,560, rounded to a whole number with thousands separators;
      null/non-finite input returns null rather than "NaN ac", same contract
      as every other formatter here). Scoped to *display formatting only*,
      per the ground rule: every `layers.yaml` `min_buildable_acres` gate and
      all internal math (density assumptions, `rankLandUseVerdicts`, etc.)
      stays in acres — only rendered text changes. Replaced every acreage
      display across the app with a `fmtAc()` wrapper: all 11 land-use
      verdicts that show a parcel-size leg (data_center, warehouse_club,
      food_truck_court, senior_living, urgent_care, self_storage,
      child_care_center, hotel, grocery_store, car_wash, pharmacy — both the
      parcel size *and* each verdict's own `*_MIN_ACRES` threshold text), the
      "Best fit here" panel's per-use reason text, the parcel summary's
      "Acreage" row (now `id="parcelAcreageVal"` so it can be updated in
      place), the "what could go here" fit list, the Compare modal's table,
      and the Compare CSV/PDF exports (CSV header text and cell values
      convert too, e.g. "Acreage (ha)"; GeoJSON exports were deliberately
      left in raw acres — structured data for GIS tools, not rendered text).
      Toggling the unit re-renders everything already on screen in place —
      `refreshAreaDisplays()` re-invokes whichever `maybeRender*Verdict` is
      active (reading already-resolved state, no network calls), refreshes
      the parcel Acreage row/fit list from `lastParcelSummary`, re-renders
      the Best-Fit panel from its last-ranked results if open, and
      re-renders the Compare modal if open. Added 15 new unit tests for
      `formatArea`/`convertArea`/`areaUnitLabel` (per-unit conversion and
      labels, null/non-finite input, unrecognized-unit fallback, sq-ft
      rounding in both directions, default-to-acres). Verified in headless
      Chromium: both pages load with zero console/page errors; a simulated
      `data_center` verdict showed "12.30 ac (≥10.00 ac)" and correctly
      re-rendered to "4.98 ha (≥4.05 ha)" then "535,788 sq ft (≥435,600 sq
      ft)" on repeated clicks with zero new fetches; the parcel Acreage row
      and Compare-modal table cell updated the same way; the CSV export
      header/value and the PDF/print report text respected the active unit;
      and a cold load with `simy_unit=ha` pre-set in `localStorage` rendered
      the toggle button as "ha" from first paint.

## Now (high value) — newly added (4)
- [x] **"Use my location" button.** Added a "📍" button next to the address
      search box (`web/explore.html`) — on click, calls the browser's
      Geolocation API and, on success, takes the same `map.setView` +
      `analyze(latlng)` path a real map click, an address search hit, or a
      pasted coordinate pair already take (`wireGeolocate()`, mirroring
      `wireAddrSearch()`'s structure). The button hides itself outright when
      `navigator.geolocation` isn't present (old browsers, or an insecure
      non-https/non-localhost origin) rather than wiring a handler that would
      always fail. A pure `geolocationErrorMessage(err)` helper added to
      `web/logic.js` maps the W3C `PositionError` codes to the same
      clear-status-text pattern the address search's fetch failures already
      use — a specific message for permission denial (the one case with an
      actionable fix) and a generic fallback for timeout/position-unavailable/
      an unrecognized error shape, both always pointing back at the address
      box as a working alternative. Added 4 new unit tests for
      `geolocationErrorMessage` (permission-denied, timeout, position-
      unavailable, missing/malformed error object). Verified: `python -m
      pytest -q` (15 passed), `simy validate` (OK, 14 land uses — this item
      touches only `web/explore.html`/`web/logic.js`), `node --test
      tests/js/*.test.mjs` (292 passed, 4 new). In headless Chromium with a
      mocked/granted geolocation permission (`context.setGeolocation`): both
      pages still load with zero console/page errors; a real click on the
      button ran the actual Geolocation API → `map.setView` → `analyze()`
      chain end to end and set `lastLatLng` to the mocked coordinates within
      0.01° (real result panel rendered, not simulated); and driving
      `geolocationErrorMessage({code:1})` through the exported helper
      produced the expected permission-denial text. Screenshots at desktop
      and mobile viewports confirm the new button sits cleanly next to the
      existing search button with no overlap of the zoom control or layer
      switcher. A true "Geolocation API entirely absent" browser-level test
      wasn't reproducible in this sandbox's Chromium (`Navigator.prototype.
      geolocation` isn't reconfigurable here) — the `if(!("geolocation" in
      navigator))` guard itself is standard feature detection, same shape
      used elsewhere in this file, so this is a sandbox testing limitation,
      not an unverified code path. Live on-device geolocation accuracy/
      permission-prompt UX is a good human spot-check, same caveat as every
      browser-API-dependent item.

## Now (high value) — newly added (5)
- [x] **16th land use: Convenience Store / Gas Station.** Added
      `convenience_store` to `data_sources/layers.yaml` — rooftop demand at a
      tight 3 km radius (a purely local walk/short-drive crowd, tighter than
      car_wash's 5 km or pharmacy's 6 km), the same
      `transportation.near_arterial_aadt: 25000` gate car_wash/pharmacy use
      (visibility matters a lot for fuel margin), `parcel.
      min_buildable_acres: 0.75` (a small pad site + fuel canopy, smaller
      than car_wash's 1.0-acre wash tunnel), and the by-now-standard inverted
      `competition.min_distance_km_from_nearest: 1.0` gate against
      `shop=convenience` OR `amenity=fuel` (two separate but often-colocated
      OSM tags — OR-fallback query, same pattern car_wash/pharmacy already
      established). Wired via `standardUseVerdict` directly in
      `web/explore.html` (same demand+site-size+AADT+competitor-distance
      shape as car_wash/grocery_store/pharmacy) — no new gate mechanism
      needed; added `convenience_store` to `ALL_USE_KEYS`, `USE_DEMAND`,
      `BEST_FIT_USES`, the per-use state var (`csState`), the
      `maybeRenderCSVerdict` render function, and every one of the roofs/
      AADT/competitor/acreage fetch-dispatch and `VERDICT_REFRESH` wiring
      points car_wash/pharmacy already have — confirmed via a full grep sweep
      that every `car_wash`/`pharmacy` reference in `explore.html` has a
      matching `convenience_store` counterpart. `simy validate` now reports
      15 land uses (was 14). Verified: `python -m pytest -q` (15 passed),
      `simy validate` (OK), `node --test tests/js/*.test.mjs` (292 passed,
      unchanged — this land use reuses fully-tested shared logic, no new pure
      helpers needed). In headless Chromium: both pages load with zero
      console/page errors; confirmed `convenience_store` is present in
      `ALL_USE_KEYS`/`USE_DEMAND`/`BEST_FIT_USES`/`MODEL.land_uses`; a real
      simulated map click with `convenience_store` selected switched mode,
      set `current`, and rendered the result panel end-to-end without
      throwing; and driving `maybeRenderCSVerdict` directly through PASS /
      SHORT-on-demand / SHORT-on-site-size / SHORT-on-AADT /
      SHORT-on-competitor-too-close / no-competitor-in-range (passes) /
      acreage-unavailable / no-rooftop-read / wrong-use-selected states all
      produced correct verdict text and CSS classes with zero throws.
      Outbound network to Overpass/ArcGIS is blocked from this sandbox, so a
      live end-to-end rooftop/AADT/competitor fetch on the real site is a
      good human spot-check, same caveat as every prior land use.
- [x] **19th parcel county: Denver, CO (City and County of Denver).** Added a
      19th `PARCEL_SOURCES` entry to `web/explore.html`. Denver doesn't
      publish its own single-layer parcel FeatureServer with a directly
      documented REST URL the way most other counties here do — its
      open-data "Parcels" layer lives behind an ArcGIS Hub item id at
      `opendata-geospatialdenver.hub.arcgis.com`, which this sandbox's egress
      proxy blocks outright (couldn't even attempt introspection, unlike the
      403-on-introspection experience every prior county hit). Used Colorado's
      state GIO statewide aggregate instead — the "Colorado Public Parcels"
      FeatureServer (`gis.colorado.gov/public/rest/services/Address_and_Parcel/
      Colorado_Public_Parcels/FeatureServer/0`) rolls every county's assessor
      parcels, Denver's included, into one schema with a `countyName` field —
      bbox-restricted to Denver here exactly like every other county entry,
      the same "lean on a good broader keyless source when one exists" call
      this file already made for the national NHS AADT layer. Confirmed (via
      multiple independent search-indexed sources, same sourcing constraint
      every prior county faced) field names: `parcel_id`, `situsAdd`, `owner`,
      `landAcres`, `landUseDsc`, `apprValTot` — added the four camelCase ones
      that don't case-insensitively collide with any existing `pick()`
      candidate (`owner` already matched the existing `"OWNER"` key
      case-insensitively) to the shared id/situs/land/acres/value candidate
      lists in `showParcel`. Denver is one of Colorado's few consolidated
      city-county governments — no separate unincorporated area at all — so
      its `zoning_note` says that explicitly rather than reusing another
      state's "check the county, or the city if incorporated" boilerplate.
      No documented per-parcel deep-link URL scheme for Denver's
      `property.spatialest.com/co/denver` search portal either, so — same
      cautious call as Harris/Bexar/LA/King/Miami-Dade/San Diego/Dallas/
      Allegheny/Fulton/Salt Lake/Franklin/Clark — `record()` links to the
      portal's own search page. Verified: `python -m pytest -q` (15 passed),
      `simy validate` (OK, 32 sources/16 layers/15 land uses, unchanged —
      this item touches no `data_sources/*.yaml`), `node --test tests/js/*.test.mjs`
      (292 passed, unchanged — no new pure helpers needed). In headless
      Chromium: both pages load with zero console/page errors; `inBbox`
      correctly routes both downtown Denver and DIA (Denver International
      Airport, far northeast of downtown but still inside the consolidated
      city-county) to the new source via the real `PARCEL_SOURCES.find(...)`
      routing `runParcel` uses, and still finds no source for an
      out-of-coverage point; and driving `showParcel` directly (after a real
      simulated map click built the result-panel shell `#parcelVal` lives in)
      with a mocked Colorado-Public-Parcels-shaped attribute payload rendered
      the parcel ID, owner, address, land use, correctly-formatted acreage
      ("2.50 ac") and appraised value ("$450,000"), the new Denver zoning
      note, and the search-page record link — all with zero throws. Live
      endpoint reachability and exact field spelling on the real
      `gis.colorado.gov` service couldn't be confirmed from this sandbox — a
      live spot-check is a good human follow-up, same caveat as every prior
      county.
- [x] **Backup/restore all local app state as a JSON file.** Added a "💾"
      header button opening a new `dataModal` (same `openModal()`/
      `closeModal()` focus-trap pair every other modal already uses) with
      "⬇️ Export data" / "⬆️ Import data" controls. Added pure
      `buildAppStateExport(storage, nowIso)` / `parseAppStateImport(text)`
      to `web/logic.js` — `buildAppStateExport` reads every known
      `simy_*` key (`APP_STATE_KEYS`: theme, unit, saved searches,
      bring-your-own-data, recently-viewed, Compare pins) via a
      `storage.getItem` duck-typed argument (so the real `localStorage`
      and a plain test mock both work) into one `{app,version,exportedAt,
      data}` payload; `parseAppStateImport` is the untrusted-input half —
      same defensive stance as the URL-hash/pasted-coordinate parsers —
      returning `null` outright on unparseable JSON or an `app`/`data`
      shape mismatch, and silently dropping any unknown key or non-string
      value from `data` rather than importing it, so a malformed or
      hand-edited file can't corrupt app state. Export downloads
      `simycity-data.json` via the same client-side-only Blob+anchor
      pattern as the existing CSV/PNG exports (no network call). Import
      reads a picked file via `FileReader` (never uploaded), validates it,
      writes the recovered keys to `localStorage`, then reloads the page
      so every already-initialized subsystem (theme, unit, pins, recent
      sites, saved searches, bring-your-own-data) picks the restored
      values back up through its normal startup path instead of
      duplicating each one's live-update logic in the import handler.
      Added 10 new unit tests (every-key round trip, missing/malformed
      storage, unparseable JSON, wrong `app`/missing or non-object `data`,
      unknown-key and non-string-value stripping, all-invalid-data →
      empty-not-null). Verified in headless Chromium: both pages load with
      zero console/page errors; clicking the real "💾" button opens the
      modal with focus moved inside; a real button click through the
      export path (Blob+anchor) throws nothing and shows "Exported."; Esc
      closes the modal and returns focus to the opener button; feeding a
      real `File` (via `DataTransfer`) into the actual `<input
      type=file>` change handler round-trips a valid export end-to-end
      (shows "Restored — reloading…") and correctly rejects a malformed
      file with a "doesn't look like a SIMyCity export" message instead of
      touching `localStorage`.

## Now (high value) — newly added (6)
- [ ] **16th land use: Multifamily / Apartment Complex (renter-housing
      developer lens).** All 15 existing land uses cover retail/service
      formats (fast_casual, grocery_store, pharmacy, …) or *for-sale*
      single-family housing (`residential_subdivision`, 3 units/ac). Add
      `multifamily` to `data_sources/layers.yaml` as a distinct rental-housing
      lens: a much higher assumed density than `residential_subdivision`
      (e.g. 25-40 units/ac for a garden-style/mid-rise complex — a real,
      documented assumption the same way `residential_subdivision`
      documents its 3 units/ac), `requires.parcel.min_buildable_acres`
      sized for that density (a few acres, not the 15 a warehouse_club
      needs), and reuse of the same school-capacity-proxy chain
      `residential_subdivision` already established (units → est. residents
      → school-age kids → nearby-school-seat-capacity via Overpass) rather
      than inventing a new demand read — the two verdicts should read as
      siblings that differ mainly in density assumption and units-per-acre,
      not in mechanism. Wire a real `maybeRenderMFVerdict` in
      `web/explore.html` (same wait-for-legs pattern as
      `maybeRenderResVerdict`), add it to `ALL_USE_KEYS`/`USE_DEMAND`/
      `BEST_FIT_USES`, and add unit tests for any new pure math (unit count
      from acreage, resident/student projection at the new density). Verify
      per the ground rules above; `simy validate` should report 16 land uses.
- [ ] **20th parcel county: Suffolk County, MA (Boston).** Every parcel
      county added so far is South, Midwest, Mountain West, or West Coast —
      New England has zero coverage. Extend `PARCEL_SOURCES` in
      `web/explore.html` with Boston/Suffolk County's public GIS parcel
      layer (search for the live ArcGIS MapServer/FeatureServer endpoint,
      same research approach every prior county entry used, since this
      sandbox can't introspect ArcGIS REST hosts directly — Boston's own
      open-data portal or MassGIS's statewide parcel layer are both worth
      checking, same "lean on a good statewide aggregate when the county
      doesn't publish its own" call the Colorado/Denver entry already made).
      Confirm real field names from search-indexed docs before adding them
      to the shared `pick()` candidate lists rather than guessing; if owner/
      address/value aren't confirmed on the public layer, leave them
      unmapped (same graceful partial-coverage precedent as King/Cook/Salt
      Lake/Franklin/Clark/Denver). Massachusetts municipalities zone their
      own land (unlike the TX counties already covered), so this needs its
      own `zoning_note`. Add a record-link URL only if a stable per-parcel
      deep-link scheme is confirmed; otherwise link to the city/county's own
      parcel-search page. `simy validate`'s source count should go from 32
      to 33.
- [ ] **Undo for removing a pin from Compare.** The Compare modal's
      per-row "✕" button (`removePin(i)` in `web/explore.html`) deletes a
      pinned parcel from `pins`/`localStorage` immediately with no
      confirmation or recovery — the same gap "clear all recently-viewed"
      had before its undo affordance was added. Mirror that established
      pattern exactly: snapshot the removed pin (and its index) before
      splicing it out, show an inline "Removed — Undo" affordance in place
      of that row for a few seconds (reuse the existing `undoClear`-style
      windowed-expiry math in `web/logic.js`, generalized or duplicated for
      a single-item restore rather than a whole-list restore), and re-insert
      the pin at its original index on Undo so pin order isn't scrambled by
      a remove-then-undo round trip. Add unit tests for the restore-within-
      window / past-the-window / boundary cases, same coverage
      `clearRecentSites`/`undoClear` already have. Verify both pages still
      load clean and that a real remove→undo click round trip in headless
      Chromium restores the exact pin without throwing.

## Done
- [x] Two-lane UX (Explore vs Test a use) with a real CTA.
- [x] Live demand read + real "why no Costco here" verdict (rooftops vs threshold).
- [x] Parcel identification (boundary + county record) with projected-CRS fix.
- [x] Developer checklist (topography, MUD, zoning, entitlements, availability).
- [x] Base-map switcher + TCAD parcel overlay + listing deep-links.
- [x] GitHub Pages auto-deploy from `main`.
