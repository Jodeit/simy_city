// Node's built-in test runner — zero dependencies, matching the repo's
// no-build-step philosophy. Run with: node --test tests/js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logic = require(path.join(__dirname, "..", "..", "web", "logic.js"));
const {
  evaluate, isContested, findStandoffs, cheapest,
  countOf, haversine, inBbox, pick, blendedDemand, seniorDemandRead,
  parseFccBlockFips, parseAcsTractRow, sampleTradeAreaPoints, dedupeTracts,
  aggregateAcsTracts, makeSessionCache, wrapText, debounce,
  encodeHash, decodeHash, encodeComparePins, decodeComparePins, mergeComparePins,
  encodeSearchHash, decodeSearchHash,
  nominatimUrl, parseNominatimResult, parseCoordPair, toCsvField, toCsvRow, toCsv, addRecentSite,
  removeRecentSite, clearRecentSites, undoClear, sortPins, sampleGrid, rankCandidates,
  parseOverpassPoints, reverseSearchSignals, candidateWhyText, candidatesToCsvRows,
  buildCandidatesReportText, buildCompareReportText,
  toPdfSafeText, escapePdfString, buildSimplePdf,
  parseAadtFeatures, maxAadtWithinRadius,
} = logic;

// ---- perspectives (evaluate / isContested) ----

test("evaluate: pro-build stakeholder with no opposed impacts leans favorable", () => {
  const model = { stakeholders: { developer: { label: "Developer", pro_build: true } } };
  const use = { impacts: {}, induces: {} };
  const [view] = evaluate(model, use, "warehouse_club");
  assert.equal(view.leaning, "favorable");
});

test("evaluate: stakeholder opposed to a high-severity impact they oppose leans opposed", () => {
  const model = {
    stakeholders: {
      environmentalist: { label: "Environmentalist", opposes_impacts: ["habitat_loss"] },
    },
  };
  const use = { impacts: { habitat_loss: "high" }, induces: {} };
  const [view] = evaluate(model, use, "data_center");
  // score = -3 (SEVERITY.high) => <= -4 is "opposed" threshold, so this alone lands "mixed"
  assert.equal(view.leaning, "mixed");
  assert.ok(view.reasons.includes("habitat_loss=high"));
});

test("evaluate: stacking two high-severity opposed impacts crosses into opposed", () => {
  const model = {
    stakeholders: {
      environmentalist: { label: "Environmentalist", opposes_impacts: ["habitat_loss", "traffic"] },
    },
  };
  const use = { impacts: { habitat_loss: "high", traffic: "high" }, induces: {} };
  const [view] = evaluate(model, use, "data_center");
  assert.equal(view.leaning, "opposed"); // score = -6
});

test("evaluate: amenity_seeker only bonuses for amenity uses (warehouse_club/fast_casual)", () => {
  const model = {
    stakeholders: { shopper: { label: "Shopper", amenity_seeker: true } },
  };
  const use = { impacts: {}, induces: {} };
  const [asAmenity] = evaluate(model, use, "warehouse_club");
  const [asNonAmenity] = evaluate(model, use, "data_center");
  assert.equal(asAmenity.leaning, "favorable"); // +2 bonus
  assert.equal(asNonAmenity.leaning, "mixed");  // no bonus, score stays 0
});

test("evaluate: opposes_structure['induces'] penalizes proportional to induced service count", () => {
  const model = {
    stakeholders: { municipality: { label: "Municipality", opposes_structure: ["induces"] } },
  };
  const use = { impacts: {}, induces: { schools: {}, roads: {} } };
  const [view] = evaluate(model, use, "residential_subdivision");
  assert.ok(view.reasons.some(r => r.includes("2 induced service")));
});

test("isContested: true only when both a favorable and an opposed view are present", () => {
  assert.equal(isContested([{ leaning: "favorable" }, { leaning: "opposed" }]), true);
  assert.equal(isContested([{ leaning: "favorable" }, { leaning: "mixed" }]), false);
  assert.equal(isContested([{ leaning: "mixed" }]), false);
});

// ---- standoffs (findStandoffs / cheapest) ----

test("findStandoffs: finds a two-node chicken-and-egg cycle", () => {
  const model = {
    enabling_edges: [
      { from: "a", to: "b", via: "supply of b", breaker_cost: "high" },
      { from: "b", to: "a", via: "supply of a", breaker_cost: "medium" },
    ],
  };
  const standoffs = findStandoffs(model);
  assert.equal(standoffs.length, 1);
  assert.deepEqual(new Set(standoffs[0].cycle), new Set(["a", "b"]));
});

test("findStandoffs: present nodes break the cycle (already-supplied prerequisite)", () => {
  const model = {
    enabling_edges: [
      { from: "a", to: "b", via: "supply of b", breaker_cost: "high" },
      { from: "b", to: "a", via: "supply of a", breaker_cost: "medium" },
    ],
  };
  const standoffs = findStandoffs(model, new Set(["a"]));
  assert.equal(standoffs.length, 0);
});

test("findStandoffs: no edges means no standoffs", () => {
  assert.deepEqual(findStandoffs({ enabling_edges: [] }), []);
});

test("cheapest: picks the lowest-cost edge (low < medium < high)", () => {
  const edges = [
    { via: "x", breaker_cost: "high" },
    { via: "y", breaker_cost: "low" },
    { via: "z", breaker_cost: "medium" },
  ];
  assert.equal(cheapest(edges).via, "y");
});

test("cheapest: missing breaker_cost defaults to high (least preferred)", () => {
  const edges = [{ via: "x" }, { via: "y", breaker_cost: "medium" }];
  assert.equal(cheapest(edges).via, "y");
});

// ---- live-read parsing (countOf / haversine) ----

test("countOf: reads Overpass `out count` total tag", () => {
  assert.equal(countOf({ elements: [{ type: "count", tags: { total: "42" } }] }), 42);
});

test("countOf: falls back to element array length when no count element present", () => {
  assert.equal(countOf({ elements: [{}, {}, {}] }), 3);
});

test("countOf: empty result is null, not zero (so it renders as unavailable, not '0 rooftops')", () => {
  assert.equal(countOf({ elements: [] }), null);
});

test("haversine: distance from a point to itself is zero", () => {
  assert.equal(haversine(30.327, -97.949, 30.327, -97.949), 0);
});

test("haversine: Austin to Houston is roughly 233 km", () => {
  const km = haversine(30.267, -97.743, 29.760, -95.369);
  assert.ok(km > 220 && km < 245, `expected ~233km, got ${km}`);
});

// ---- blended demand (fast_casual: rooftops + daytime-POI proxy) ----

test("blendedDemand: null roofs means no verdict yet", () => {
  assert.equal(blendedDemand(null, 10, 20, 9000), null);
});

test("blendedDemand: missing daytime count treated as zero, matches rooftop-only ratio", () => {
  const b = blendedDemand(9000, null, 20, 9000);
  assert.equal(b.effective, 9000);
  assert.equal(b.ratio, 1);
  assert.equal(b.pass, true);
});

test("blendedDemand: daytime POIs can push a rooftop-short area over the bar", () => {
  const short = blendedDemand(3000, 0, 20, 9000);
  assert.equal(short.pass, false); // 3000/9000 well under 0.85
  const withDaytime = blendedDemand(3000, 400, 20, 9000); // +8000 effective units
  assert.equal(withDaytime.effective, 11000);
  assert.equal(withDaytime.pass, true);
});

test("blendedDemand: pass threshold is 85% of need, same as the rooftop-only verdict", () => {
  const justUnder = blendedDemand(7649, 0, 20, 9000); // 84.99%
  const justOver = blendedDemand(7650, 0, 20, 9000);  // 85.0%
  assert.equal(justUnder.pass, false);
  assert.equal(justOver.pass, true);
});

// ---- senior demand read (senior_living: trade-area median age vs a threshold) ----

test("seniorDemandRead: null medianAge means no verdict yet", () => {
  assert.equal(seniorDemandRead(null, 40), null);
});

test("seniorDemandRead: median age at/above threshold passes", () => {
  const atThreshold = seniorDemandRead(40, 40);
  assert.equal(atThreshold.ratio, 1);
  assert.equal(atThreshold.pass, true);
  const above = seniorDemandRead(45, 40);
  assert.equal(above.pass, true);
});

test("seniorDemandRead: pass threshold is 85% of the age threshold, same bar blendedDemand uses", () => {
  const justUnder = seniorDemandRead(33.99, 40); // 84.975%
  const justOver = seniorDemandRead(34, 40);     // 85.0%
  assert.equal(justUnder.pass, false);
  assert.equal(justOver.pass, true);
});

test("seniorDemandRead: a much younger trade area clearly fails", () => {
  const young = seniorDemandRead(28, 40);
  assert.equal(young.pass, false);
  assert.ok(young.ratio < 0.85);
});

// ---- parcel helpers (inBbox / pick) ----

test("inBbox: point inside/outside a [minLng,minLat,maxLng,maxLat] box", () => {
  const bbox = [-98.17, 30.02, -97.37, 30.63];
  assert.equal(inBbox({ lng: -97.949, lat: 30.327 }, bbox), true);
  assert.equal(inBbox({ lng: -80, lat: 30.327 }, bbox), false);
});

test("pick: returns the first present key, exact case first", () => {
  assert.equal(pick({ PROP_ID: "123", GEO_ID: "456" }, ["PROP_ID", "GEO_ID"]), "123");
  assert.equal(pick({ GEO_ID: "456" }, ["PROP_ID", "GEO_ID"]), "456");
});

test("pick: falls back to case-insensitive match", () => {
  assert.equal(pick({ prop_id: "789" }, ["PROP_ID"]), "789");
});

test("pick: skips empty-string / null / undefined values", () => {
  assert.equal(pick({ PROP_ID: "", GEO_ID: null, OTHER: "999" }, ["PROP_ID", "GEO_ID", "OTHER"]), "999");
});

test("pick: returns null when nothing matches, and on a null object", () => {
  assert.equal(pick({ a: "1" }, ["b", "c"]), null);
  assert.equal(pick(null, ["a"]), null);
});

// ---- Census tract demographics (parseFccBlockFips / parseAcsTractRow) ----

test("parseFccBlockFips: splits a 15-digit block FIPS into state/county/tract", () => {
  const json = { results: [{ block_fips: "484539511001042" }] };
  assert.deepEqual(parseFccBlockFips(json), { state: "48", county: "453", tract: "951100" });
});

test("parseFccBlockFips: missing/short block_fips or no results is null", () => {
  assert.equal(parseFccBlockFips({ results: [] }), null);
  assert.equal(parseFccBlockFips({ results: [{ block_fips: "123" }] }), null);
  assert.equal(parseFccBlockFips({}), null);
});

test("parseAcsTractRow: reads households/median income/median age from the [headers,row] shape", () => {
  const json = [
    ["NAME", "B11001_001E", "B19013_001E", "B01002_001E", "state", "county", "tract"],
    ["Census Tract 12.34, Travis County, Texas", "2345", "78901", "34.5", "48", "453", "951100"],
  ];
  assert.deepEqual(parseAcsTractRow(json), { households: 2345, medianIncome: 78901, medianAge: 34.5 });
});

test("parseAcsTractRow: treats Census's large-negative suppression sentinel as missing", () => {
  const json = [
    ["NAME", "B11001_001E", "B19013_001E", "B01002_001E"],
    ["Tract X", "-666666666", "50000", "-666666666"],
  ];
  const d = parseAcsTractRow(json);
  assert.equal(d.households, null);
  assert.equal(d.medianIncome, 50000);
  assert.equal(d.medianAge, null);
});

test("parseAcsTractRow: malformed/short response is null", () => {
  assert.equal(parseAcsTractRow(null), null);
  assert.equal(parseAcsTractRow([["NAME"]]), null);
});

// ---- integration: the real compiled model runs cleanly through evaluate/findStandoffs ----

test("real model.json: evaluate() runs for every land use without throwing", () => {
  const model = require(path.join(__dirname, "..", "..", "web", "model.json"));
  for (const [key, use] of Object.entries(model.land_uses)) {
    const views = evaluate(model, use, key);
    assert.ok(views.length > 0, `${key} produced no stakeholder views`);
    for (const v of views) {
      assert.ok(["favorable", "opposed", "mixed"].includes(v.leaning), `${key}/${v.stakeholder} bad leaning`);
    }
  }
});

test("real model.json: findStandoffs() returns well-formed cycles", () => {
  const model = require(path.join(__dirname, "..", "..", "web", "model.json"));
  const standoffs = findStandoffs(model);
  for (const s of standoffs) {
    assert.ok(s.cycle.length >= 2);
    assert.ok(s.edges.length >= 1);
    cheapest(s.edges); // must not throw on real breaker_cost values
  }
});

// ---- multi-tract Census ACS trade area (sampleTradeAreaPoints / dedupeTracts / aggregateAcsTracts) ----

test("sampleTradeAreaPoints: returns the center plus 8 compass-bearing points", () => {
  const pts = sampleTradeAreaPoints(30.327, -97.949, 15);
  assert.equal(pts.length, 9);
  assert.deepEqual(pts[0], { lat: 30.327, lng: -97.949 });
});

test("sampleTradeAreaPoints: ring points sit ~60% of the radius from the center", () => {
  const pts = sampleTradeAreaPoints(30.327, -97.949, 10); // 10km radius -> 6km ring
  const dists = pts.slice(1).map((p) => haversine(30.327, -97.949, p.lat, p.lng));
  dists.forEach((km) => assert.ok(km > 5.9 && km < 6.1, `expected ~6km, got ${km}`));
});

test("sampleTradeAreaPoints: ring points spread across distinct bearings, not clustered", () => {
  const pts = sampleTradeAreaPoints(30.327, -97.949, 10);
  const lats = new Set(pts.map((p) => p.lat.toFixed(4)));
  assert.ok(lats.size > 1, "expected points at more than one latitude");
});

test("dedupeTracts: collapses repeated tracts to unique state+county+tract, first occurrence kept", () => {
  const a = { state: "48", county: "453", tract: "001100" };
  const b = { state: "48", county: "453", tract: "001100" };
  const c = { state: "48", county: "453", tract: "001200" };
  assert.deepEqual(dedupeTracts([a, b, c]), [a, c]);
});

test("dedupeTracts: drops nulls (failed per-point lookups) without erroring", () => {
  const a = { state: "48", county: "453", tract: "001100" };
  assert.deepEqual(dedupeTracts([null, a, null]), [a]);
});

test("dedupeTracts: empty/undefined input returns an empty array", () => {
  assert.deepEqual(dedupeTracts([]), []);
  assert.deepEqual(dedupeTracts(undefined), []);
});

test("aggregateAcsTracts: sums households and household-weights income/age across tracts", () => {
  const rows = [
    { households: 1000, medianIncome: 60000, medianAge: 30 },
    { households: 3000, medianIncome: 100000, medianAge: 40 },
  ];
  const agg = aggregateAcsTracts(rows);
  assert.equal(agg.tracts, 2);
  assert.equal(agg.totalHouseholds, 4000);
  assert.equal(agg.medianIncome, (1000 * 60000 + 3000 * 100000) / 4000);
  assert.equal(agg.medianAge, (1000 * 30 + 3000 * 40) / 4000);
});

test("aggregateAcsTracts: excludes tracts with no household count from the roll-up", () => {
  const rows = [{ households: 500, medianIncome: 50000, medianAge: 35 }, { households: null }, null];
  const agg = aggregateAcsTracts(rows);
  assert.equal(agg.tracts, 1);
  assert.equal(agg.totalHouseholds, 500);
});

test("aggregateAcsTracts: a tract missing just income/age is excluded from that average only", () => {
  const rows = [
    { households: 1000, medianIncome: null, medianAge: 30 },
    { households: 1000, medianIncome: 80000, medianAge: null },
  ];
  const agg = aggregateAcsTracts(rows);
  assert.equal(agg.totalHouseholds, 2000);
  assert.equal(agg.medianIncome, 80000); // only the second tract contributes
  assert.equal(agg.medianAge, 30);       // only the first tract contributes
});

test("aggregateAcsTracts: no valid tracts at all is null", () => {
  assert.equal(aggregateAcsTracts([]), null);
  assert.equal(aggregateAcsTracts([{ households: null }, null]), null);
  assert.equal(aggregateAcsTracts(undefined), null);
});

// ---- session-lifetime response cache (explore.html's Overpass/ArcGIS/Census
// lookups, so re-clicking a parcel or re-navigating to a Compare pin reuses
// this session's answers instead of re-fetching) ----

test("makeSessionCache: same key runs the fetcher once and reuses the result", async () => {
  const cache = makeSessionCache(10);
  let calls = 0;
  const run = () => { calls++; return Promise.resolve("data-" + calls); };
  const a = await cache("k1", run);
  const b = await cache("k1", run);
  assert.equal(a, "data-1");
  assert.equal(b, "data-1");
  assert.equal(calls, 1);
});

test("makeSessionCache: different keys run independently", async () => {
  const cache = makeSessionCache(10);
  let calls = 0;
  const run = () => { calls++; return Promise.resolve(calls); };
  const a = await cache("k1", run);
  const b = await cache("k2", run);
  assert.equal(a, 1);
  assert.equal(b, 2);
  assert.equal(calls, 2);
});

test("makeSessionCache: a rejected fetch is evicted so the next call retries", async () => {
  const cache = makeSessionCache(10);
  let calls = 0;
  const run = () => { calls++; return calls === 1 ? Promise.reject(new Error("network")) : Promise.resolve("ok"); };
  await assert.rejects(() => cache("k1", run));
  const result = await cache("k1", run);
  assert.equal(result, "ok");
  assert.equal(calls, 2);
});

test("makeSessionCache: concurrent calls for the same key share one in-flight promise", async () => {
  const cache = makeSessionCache(10);
  let calls = 0;
  const run = () => { calls++; return Promise.resolve("shared"); };
  const [a, b] = await Promise.all([cache("k1", run), cache("k1", run)]);
  assert.equal(a, "shared");
  assert.equal(b, "shared");
  assert.equal(calls, 1);
});

test("makeSessionCache: evicts the oldest entry once past maxEntries", async () => {
  const cache = makeSessionCache(2);
  await cache("k1", () => Promise.resolve("v1"));
  await cache("k2", () => Promise.resolve("v2"));
  await cache("k3", () => Promise.resolve("v3")); // k1 should be evicted now

  let calls = 0;
  const result = await cache("k1", () => { calls++; return Promise.resolve("v1-again"); });
  assert.equal(calls, 1, "k1 should have been re-fetched after eviction");
  assert.equal(result, "v1-again");

  let k3Calls = 0;
  await cache("k3", () => { k3Calls++; return Promise.resolve("v3"); });
  assert.equal(k3Calls, 0, "k3 should still be cached");
});

// ---- wrapText (word-wrap for the "make the case" image export) ----
// measure-agnostic: tests use character count as the "width" unit so they
// don't need a real canvas; explore.html passes ctx.measureText for pixels.
const charWidth = s => s.length;

test("wrapText: short line passes through unchanged", () => {
  assert.deepEqual(wrapText("hello world", 20, charWidth), ["hello world"]);
});

test("wrapText: wraps on word boundaries once a line exceeds maxWidth", () => {
  const lines = wrapText("the quick brown fox jumps", 10, charWidth);
  lines.forEach(l => assert.ok(l.length <= 10, `"${l}" exceeds maxWidth`));
  assert.deepEqual(lines.join(" ").split(" ").filter(Boolean), ["the", "quick", "brown", "fox", "jumps"]);
});

test("wrapText: preserves existing newlines as separate wrapped segments", () => {
  const lines = wrapText("line one\nline two", 20, charWidth);
  assert.deepEqual(lines, ["line one", "line two"]);
});

test("wrapText: preserves blank lines (section breaks) instead of dropping them", () => {
  const lines = wrapText("a\n\nb", 20, charWidth);
  assert.deepEqual(lines, ["a", "", "b"]);
});

test("wrapText: a single word longer than maxWidth is kept whole, not truncated", () => {
  const lines = wrapText("supercalifragilisticexpialidocious", 10, charWidth);
  assert.deepEqual(lines, ["supercalifragilisticexpialidocious"]);
});

// ---- debounce (collapses a rapid-click burst into one trailing call) ----

test("debounce: a single call fires once, after the wait", async () => {
  let calls = [];
  const d = debounce((x) => calls.push(x), 20);
  d("a");
  assert.deepEqual(calls, []); // not yet — still waiting
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(calls, ["a"]);
});

test("debounce: a rapid burst collapses into one call with the last args", async () => {
  let calls = [];
  const d = debounce((x) => calls.push(x), 20);
  d("a"); d("b"); d("c");
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(calls, ["c"]); // "a" and "b" never fire — no wasted fan-out
});

test("debounce: calls spaced further apart than the wait each fire separately", async () => {
  let calls = [];
  const d = debounce((x) => calls.push(x), 15);
  d("a");
  await new Promise((r) => setTimeout(r, 30));
  d("b");
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(calls, ["a", "b"]);
});

test("debounce: cancel() drops a pending trailing call", async () => {
  let calls = [];
  const d = debounce((x) => calls.push(x), 15);
  d("a");
  d.cancel();
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(calls, []);
});

// ---- encodeHash / decodeHash (shareable permalink) ----

test("encodeHash/decodeHash: explore-mode round trip carries mode + point, no use", () => {
  const hash = encodeHash("explore", "data_center", 30.372, -97.982);
  assert.equal(hash, "mode=explore&lat=30.37200&lng=-97.98200");
  const q = decodeHash(hash);
  assert.deepEqual(q, { mode: "explore", use: null, lat: 30.372, lng: -97.982 });
});

test("encodeHash/decodeHash: build-mode round trip also carries the selected use", () => {
  const hash = encodeHash("build", "warehouse_club", 30.1, -97.5);
  const q = decodeHash(hash);
  assert.deepEqual(q, { mode: "build", use: "warehouse_club", lat: 30.1, lng: -97.5 });
});

test("decodeHash: accepts a leading '#' (as read straight off location.hash)", () => {
  const q = decodeHash("#mode=explore&lat=1&lng=2");
  assert.equal(q.lat, 1);
  assert.equal(q.lng, 2);
});

test("decodeHash: empty or absent hash returns null", () => {
  assert.equal(decodeHash(""), null);
  assert.equal(decodeHash("#"), null);
  assert.equal(decodeHash(undefined), null);
});

test("decodeHash: unrecognized mode is dropped rather than trusted verbatim", () => {
  const q = decodeHash("mode=bogus&lat=1&lng=2");
  assert.equal(q.mode, null);
});

test("decodeHash: missing/unparseable lat or lng comes back null, not NaN", () => {
  assert.equal(decodeHash("mode=explore").lat, null);
  assert.equal(decodeHash("mode=explore&lat=notanumber&lng=2").lat, null);
});

test("decodeHash: a use value is URI-decoded", () => {
  const q = decodeHash(`mode=build&use=${encodeURIComponent("fast_casual")}&lat=1&lng=2`);
  assert.equal(q.use, "fast_casual");
});

// ---- encodeComparePins / decodeComparePins / mergeComparePins (shareable Compare list) ----

test("encodeComparePins: empty list encodes to an empty string", () => {
  assert.equal(encodeComparePins([]), "");
  assert.equal(encodeComparePins(null), "");
});

test("encodeComparePins/decodeComparePins: round trips the fields renderCompare displays", () => {
  const pins = [
    { lat: 30.37201234, lng: -97.98209876, label: "123 Main St", owner: "Acme LLC",
      acres: 12.5, value: 450000, land: "COMMERCIAL", county: "Travis County, TX",
      use: "Warehouse club", verdict: "PASS — clears the bar" },
  ];
  const seg = encodeComparePins(pins);
  assert.ok(seg.startsWith("cmp="));
  const back = decodeComparePins(seg);
  assert.equal(back.length, 1);
  assert.equal(back[0].lat, 30.37201);   // rounded to 5 decimals, same as encodeHash
  assert.equal(back[0].lng, -97.98210);
  assert.equal(back[0].label, "123 Main St");
  assert.equal(back[0].owner, "Acme LLC");
  assert.equal(back[0].acres, 12.5);
  assert.equal(back[0].value, 450000);
  assert.equal(back[0].land, "COMMERCIAL");
  assert.equal(back[0].county, "Travis County, TX");
  assert.equal(back[0].use, "Warehouse club");
  assert.equal(back[0].verdict, "PASS — clears the bar");
});

test("encodeComparePins: caps at 6 pins", () => {
  const pins = Array.from({ length: 9 }, (_, i) => ({ lat: i, lng: i }));
  const back = decodeComparePins(encodeComparePins(pins));
  assert.equal(back.length, 6);
});

test("decodeComparePins: missing fields default to null, not undefined/NaN", () => {
  const back = decodeComparePins(encodeComparePins([{ lat: 1, lng: 2 }]));
  assert.deepEqual(back[0], {
    lat: 1, lng: 2, label: null, owner: null, acres: null, value: null,
    land: null, county: null, use: null, verdict: null,
  });
});

test("decodeComparePins: rows missing lat/lng are dropped, not passed through as NaN", () => {
  const seg = "cmp=" + encodeURIComponent(JSON.stringify([
    { lat: 1, lng: 2 }, { lat: "nope", lng: 2 }, { lng: 2 },
  ]));
  const back = decodeComparePins(seg);
  assert.equal(back.length, 1);
  assert.equal(back[0].lat, 1);
});

test("decodeComparePins: absent hash, no cmp segment, or malformed JSON all return null (not throw)", () => {
  assert.equal(decodeComparePins(""), null);
  assert.equal(decodeComparePins("#mode=explore&lat=1&lng=2"), null);
  assert.equal(decodeComparePins("cmp=%7Bnot-valid-json"), null);
  assert.equal(decodeComparePins("cmp=" + encodeURIComponent(JSON.stringify({ not: "an array" }))), null);
});

test("decodeComparePins: coexists with a mode/use/lat/lng hash without corrupting either", () => {
  const cmpSeg = encodeComparePins([{ lat: 1, lng: 2, label: "Site A" }]);
  const hash = `mode=build&use=data_center&lat=30.1&lng=-97.5&${cmpSeg}`;
  const q = decodeHash(hash);
  assert.deepEqual(q, { mode: "build", use: "data_center", lat: 30.1, lng: -97.5 });
  const cmp = decodeComparePins(hash);
  assert.equal(cmp[0].label, "Site A");
});

test("mergeComparePins: appends incoming pins not already present, deduped by rounded lat/lng", () => {
  const existing = [{ lat: 1, lng: 1, label: "Existing" }];
  const incoming = [{ lat: 1.0000001, lng: 1.0000001, label: "Dup" }, { lat: 2, lng: 2, label: "New" }];
  const merged = mergeComparePins(existing, incoming);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].label, "Existing");
  assert.equal(merged[1].label, "New");
});

test("mergeComparePins: caps the merged result at 6, dropping overflow", () => {
  const existing = Array.from({ length: 5 }, (_, i) => ({ lat: i, lng: i }));
  const incoming = Array.from({ length: 4 }, (_, i) => ({ lat: 10 + i, lng: 10 + i }));
  const merged = mergeComparePins(existing, incoming);
  assert.equal(merged.length, 6);
});

test("mergeComparePins: never mutates the existing list in place", () => {
  const existing = [{ lat: 1, lng: 1 }];
  mergeComparePins(existing, [{ lat: 2, lng: 2 }]);
  assert.equal(existing.length, 1);
});

// ---- encodeSearchHash / decodeSearchHash (shareable reverse search) ----

test("encodeSearchHash/decodeSearchHash: round trips center + radius + use", () => {
  const hash = encodeSearchHash(30.372412, -97.982109, 1200, "food_truck_court");
  const q = decodeSearchHash(hash);
  assert.deepEqual(q, { lat: 30.37241, lng: -97.98211, radius: 1200, use: "food_truck_court" });
});

test("encodeSearchHash: rounds lat/lng to 5 decimals and radius to a whole meter", () => {
  const hash = encodeSearchHash(30.1234567, -97.9876543, 1199.6, "warehouse_club");
  const q = decodeSearchHash(hash);
  assert.equal(q.lat, 30.12346);
  assert.equal(q.lng, -97.98765);
  assert.equal(q.radius, 1200);
});

test("decodeSearchHash: absent hash, no search segment, or malformed JSON all return null (not throw)", () => {
  assert.equal(decodeSearchHash(""), null);
  assert.equal(decodeSearchHash("#mode=explore&lat=1&lng=2"), null);
  assert.equal(decodeSearchHash("search=%7Bnot-valid-json"), null);
  assert.equal(decodeSearchHash("search=" + encodeURIComponent(JSON.stringify("not an object"))), null);
});

test("decodeSearchHash: missing/unparseable fields come back null, not NaN", () => {
  const q1 = decodeSearchHash("search=" + encodeURIComponent(JSON.stringify({ lat: 1 })));
  assert.equal(q1.lng, null);
  assert.equal(q1.radius, null);
  assert.equal(q1.use, null);
  const q2 = decodeSearchHash("search=" + encodeURIComponent(JSON.stringify({ lat: "x", lng: 1, radius: "y" })));
  assert.equal(q2.lat, null);
  assert.equal(q2.radius, null);
});

test("decodeSearchHash: a zero or negative radius is rejected, not passed through", () => {
  const q = decodeSearchHash("search=" + encodeURIComponent(JSON.stringify({ lat: 1, lng: 2, radius: 0, use: "data_center" })));
  assert.equal(q.radius, null);
});

test("encodeSearchHash/decodeSearchHash: coexists with a mode/use/lat/lng hash without corrupting either", () => {
  const searchSeg = encodeSearchHash(30.1, -97.5, 1200, "food_truck_court");
  const hash = `mode=build&use=data_center&lat=30.1&lng=-97.5&${searchSeg}`;
  const q = decodeHash(hash);
  assert.deepEqual(q, { mode: "build", use: "data_center", lat: 30.1, lng: -97.5 });
  const srch = decodeSearchHash(hash);
  assert.equal(srch.use, "food_truck_court");
  assert.equal(srch.radius, 1200);
});

// ---- nominatimUrl / parseNominatimResult (address search) ----

test("nominatimUrl: builds a format=json,limit=1 search URL with the query encoded", () => {
  const url = nominatimUrl("123 Main St, Austin, TX");
  assert.ok(url.startsWith("https://nominatim.openstreetmap.org/search?"));
  assert.ok(url.includes("format=json"));
  assert.ok(url.includes("limit=1"));
  assert.ok(url.includes("q=123%20Main%20St%2C%20Austin%2C%20TX"));
});

test("parseNominatimResult: reads lat/lng/label from the first hit", () => {
  const json = [{ lat: "30.267200", lon: "-97.743100", display_name: "Austin, Travis County, Texas" }];
  assert.deepEqual(parseNominatimResult(json), { lat: 30.2672, lng: -97.7431, label: "Austin, Travis County, Texas" });
});

test("parseNominatimResult: an empty results array is null (no match)", () => {
  assert.equal(parseNominatimResult([]), null);
});

test("parseNominatimResult: a malformed/non-array response is null, not a throw", () => {
  assert.equal(parseNominatimResult(null), null);
  assert.equal(parseNominatimResult({ error: "Unable to geocode" }), null);
});

test("parseNominatimResult: unparseable lat/lon on the hit is null", () => {
  assert.equal(parseNominatimResult([{ lat: "not-a-number", lon: "-97.7" }]), null);
});

// ---- parseCoordPair (short-circuit a pasted "lat, lng" pair) ----

test("parseCoordPair: parses a plain 'lat, lng' pair", () => {
  assert.deepEqual(parseCoordPair("30.2672, -97.7431"), { lat: 30.2672, lng: -97.7431 });
});

test("parseCoordPair: parses without a space after the comma", () => {
  assert.deepEqual(parseCoordPair("30.2672,-97.7431"), { lat: 30.2672, lng: -97.7431 });
});

test("parseCoordPair: trims surrounding whitespace and handles integers", () => {
  assert.deepEqual(parseCoordPair("  30, -97  "), { lat: 30, lng: -97 });
});

test("parseCoordPair: out-of-range lat or lng is null", () => {
  assert.equal(parseCoordPair("95, -97.7431"), null);
  assert.equal(parseCoordPair("30.2672, -181"), null);
  assert.equal(parseCoordPair("-91, 0"), null);
  assert.equal(parseCoordPair("0, 181"), null);
});

test("parseCoordPair: address-shaped strings with a comma do not match", () => {
  assert.equal(parseCoordPair("123 Main St, Austin, TX"), null);
  assert.equal(parseCoordPair("Austin, TX"), null);
});

test("parseCoordPair: empty, non-string, or malformed input is null", () => {
  assert.equal(parseCoordPair(""), null);
  assert.equal(parseCoordPair("   "), null);
  assert.equal(parseCoordPair(null), null);
  assert.equal(parseCoordPair(undefined), null);
  assert.equal(parseCoordPair("30.2672"), null);
  assert.equal(parseCoordPair("30.2672, -97.7431, 5"), null);
});

// ---- toCsvField / toCsvRow / toCsv (Compare list CSV export) ----

test("toCsvField: a plain field passes through unquoted", () => {
  assert.equal(toCsvField("Travis County"), "Travis County");
});

test("toCsvField: a field containing a comma is wrapped in quotes", () => {
  assert.equal(toCsvField("Smith, John Trust"), '"Smith, John Trust"');
});

test("toCsvField: a field containing a double quote is wrapped and the quote doubled", () => {
  assert.equal(toCsvField('12" Water Line'), '"12"" Water Line"');
});

test("toCsvField: a field containing a newline is wrapped in quotes", () => {
  assert.equal(toCsvField("line one\nline two"), '"line one\nline two"');
});

test("toCsvField: null/undefined become an empty string, not the literal text", () => {
  assert.equal(toCsvField(null), "");
  assert.equal(toCsvField(undefined), "");
});

test("toCsvField: a number field is stringified", () => {
  assert.equal(toCsvField(12.5), "12.5");
});

test("toCsvRow: joins fields with commas, quoting only where needed", () => {
  assert.equal(toCsvRow(["Site A", "Smith, John", 12.5, null]), 'Site A,"Smith, John",12.5,');
});

test("toCsv: joins rows with CRLF for a full multi-row round trip", () => {
  const csv = toCsv([
    ["Site", "Owner"],
    ["123 Main St", "Smith, John Trust"],
    ["456 Oak Ave", null],
  ]);
  assert.equal(csv, 'Site,Owner\r\n123 Main St,"Smith, John Trust"\r\n456 Oak Ave,');
});

// ---- addRecentSite (recently-viewed sites, session history) ----

test("addRecentSite: prepends a new site to an empty list", () => {
  const list = addRecentSite([], { lat: 1, lng: 1, label: "A" });
  assert.deepEqual(list, [{ lat: 1, lng: 1, label: "A" }]);
});

test("addRecentSite: prepends a new site ahead of existing ones (most-recent-first)", () => {
  const list = addRecentSite([{ lat: 1, lng: 1, label: "Old" }], { lat: 2, lng: 2, label: "New" });
  assert.equal(list.length, 2);
  assert.equal(list[0].label, "New");
  assert.equal(list[1].label, "Old");
});

test("addRecentSite: re-visiting an already-listed point (within rounding) moves it to the front instead of duplicating", () => {
  const existing = [
    { lat: 1, lng: 1, label: "First" },
    { lat: 2, lng: 2, label: "Second" },
  ];
  const list = addRecentSite(existing, { lat: 2.0000001, lng: 2.0000001, label: "Second (revisited)" });
  assert.equal(list.length, 2);
  assert.equal(list[0].label, "Second (revisited)");
  assert.equal(list[1].label, "First");
});

test("addRecentSite: caps the list at the given size, dropping the oldest", () => {
  // MRU order: index 0 is most recent, so the last entry (index 5) is the oldest.
  const existing = Array.from({ length: 6 }, (_, i) => ({ lat: i, lng: i, label: `Site ${i}` }));
  const list = addRecentSite(existing, { lat: 99, lng: 99, label: "Newest" }, 6);
  assert.equal(list.length, 6);
  assert.equal(list[0].label, "Newest");
  assert.ok(!list.some(p => p.label === "Site 5"));  // oldest fell off
});

test("addRecentSite: defaults the cap to 6 when not given", () => {
  const existing = Array.from({ length: 6 }, (_, i) => ({ lat: i, lng: i }));
  const list = addRecentSite(existing, { lat: 99, lng: 99 });
  assert.equal(list.length, 6);
});

test("addRecentSite: never mutates the existing list in place", () => {
  const existing = [{ lat: 1, lng: 1 }];
  addRecentSite(existing, { lat: 2, lng: 2 });
  assert.equal(existing.length, 1);
});

// ---- removeRecentSite ----

test("removeRecentSite: removes the entry at the given index", () => {
  const existing = [{ label: "A" }, { label: "B" }, { label: "C" }];
  const list = removeRecentSite(existing, 1);
  assert.deepEqual(list, [{ label: "A" }, { label: "C" }]);
});

test("removeRecentSite: removing the first index shifts the rest forward", () => {
  const existing = [{ label: "A" }, { label: "B" }];
  const list = removeRecentSite(existing, 0);
  assert.deepEqual(list, [{ label: "B" }]);
});

test("removeRecentSite: no-ops on an out-of-range index (too high)", () => {
  const existing = [{ label: "A" }];
  const list = removeRecentSite(existing, 5);
  assert.deepEqual(list, existing);
});

test("removeRecentSite: no-ops on a negative index", () => {
  const existing = [{ label: "A" }];
  const list = removeRecentSite(existing, -1);
  assert.deepEqual(list, existing);
});

test("removeRecentSite: handles a missing/null list gracefully", () => {
  assert.deepEqual(removeRecentSite(null, 0), []);
  assert.deepEqual(removeRecentSite(undefined, 0), []);
});

test("removeRecentSite: never mutates the existing list in place", () => {
  const existing = [{ label: "A" }, { label: "B" }];
  removeRecentSite(existing, 0);
  assert.equal(existing.length, 2);
});

// ---- clearRecentSites / undoClear ("clear all" + undo) ----

test("clearRecentSites: returns an empty list regardless of input", () => {
  assert.deepEqual(clearRecentSites([{ label: "A" }, { label: "B" }]), []);
  assert.deepEqual(clearRecentSites([]), []);
});

test("clearRecentSites: never mutates the existing list in place", () => {
  const existing = [{ label: "A" }, { label: "B" }];
  clearRecentSites(existing);
  assert.equal(existing.length, 2);
});

test("undoClear: restores the exact list that was cleared, within the window", () => {
  const saved = [{ label: "A" }, { label: "B" }];
  const restored = undoClear(saved, 1000, 1500, 8000);
  assert.deepEqual(restored, saved);
  assert.equal(restored, saved); // same reference — the exact list, not a copy
});

test("undoClear: returns null once the undo window has elapsed", () => {
  const saved = [{ label: "A" }];
  assert.equal(undoClear(saved, 1000, 9001, 8000), null);
});

test("undoClear: right at the window boundary still restores", () => {
  const saved = [{ label: "A" }];
  assert.deepEqual(undoClear(saved, 1000, 9000, 8000), saved);
});

test("undoClear: defaults the window to 8000ms when not given", () => {
  const saved = [{ label: "A" }];
  assert.deepEqual(undoClear(saved, 0, 7999), saved);
  assert.equal(undoClear(saved, 0, 8001), null);
});

test("undoClear: returns null when there is nothing saved (already used, or never cleared)", () => {
  assert.equal(undoClear(null, 0, 100, 8000), null);
  assert.equal(undoClear(undefined, 0, 100, 8000), null);
  assert.equal(undoClear([], 0, 100, 8000), null);
});

// ---- sortPins (Compare-parcels table sort) ----

test("sortPins: sorts ascending by a numeric key by default", () => {
  const pins = [{ label: "B", acres: 5 }, { label: "A", acres: 2 }, { label: "C", acres: 9 }];
  const sorted = sortPins(pins, "acres", "asc");
  assert.deepEqual(sorted.map(p => p.label), ["A", "B", "C"]);
});

test("sortPins: sorts descending when dir is 'desc'", () => {
  const pins = [{ label: "B", value: 500 }, { label: "A", value: 200 }, { label: "C", value: 900 }];
  const sorted = sortPins(pins, "value", "desc");
  assert.deepEqual(sorted.map(p => p.label), ["C", "B", "A"]);
});

test("sortPins: pins missing the sort field sort last, in both directions", () => {
  const pins = [{ label: "known", acres: 3 }, { label: "unknown" }, { label: "known2", acres: 1 }];
  assert.deepEqual(sortPins(pins, "acres", "asc").map(p => p.label), ["known2", "known", "unknown"]);
  assert.deepEqual(sortPins(pins, "acres", "desc").map(p => p.label), ["known", "known2", "unknown"]);
});

test("sortPins: treats an unspecified dir as ascending", () => {
  const pins = [{ acres: 3 }, { acres: 1 }, { acres: 2 }];
  assert.deepEqual(sortPins(pins, "acres").map(p => p.acres), [1, 2, 3]);
});

test("sortPins: handles a list where every pin is missing the field", () => {
  const pins = [{ label: "A" }, { label: "B" }];
  const sorted = sortPins(pins, "value", "asc");
  assert.equal(sorted.length, 2);
});

test("sortPins: never mutates the input list in place", () => {
  const pins = [{ acres: 3 }, { acres: 1 }];
  sortPins(pins, "acres", "asc");
  assert.equal(pins[0].acres, 3);
});

test("sortPins: handles a missing/null pins list gracefully", () => {
  assert.deepEqual(sortPins(null, "acres", "asc"), []);
  assert.deepEqual(sortPins(undefined, "acres", "asc"), []);
});

// ---- reverse search step 1: sampleGrid / rankCandidates ----

test("sampleGrid: every point falls within radiusM of center", () => {
  const center = { lat: 30.2672, lng: -97.7431 };
  const points = sampleGrid(center, 500, 100);
  assert.ok(points.length > 1);
  points.forEach(p => {
    const km = haversine(center.lat, center.lng, p.lat, p.lng);
    assert.ok(km * 1000 <= 500 * 1.05, `point ${km * 1000}m exceeded radius`);
  });
});

test("sampleGrid: includes the center point itself", () => {
  const center = { lat: 30.2672, lng: -97.7431 };
  const points = sampleGrid(center, 300, 100);
  assert.ok(points.some(p => Math.abs(p.lat - center.lat) < 1e-9 && Math.abs(p.lng - center.lng) < 1e-9));
});

test("sampleGrid: a zero radius returns just the center point", () => {
  const center = { lat: 30.2672, lng: -97.7431 };
  assert.deepEqual(sampleGrid(center, 0, 100), [{ lat: center.lat, lng: center.lng }]);
});

test("sampleGrid: caps the point count at 150 even for a huge radius / tiny spacing", () => {
  const points = sampleGrid({ lat: 30.2672, lng: -97.7431 }, 5000, 50);
  assert.ok(points.length <= 150, `got ${points.length} points`);
  assert.ok(points.length > 50, "should still cover the area, not collapse to a handful");
});

test("sampleGrid: handles a missing/invalid center gracefully", () => {
  assert.deepEqual(sampleGrid(null, 500, 100), []);
  assert.deepEqual(sampleGrid({ lat: NaN, lng: -97 }, 500, 100), []);
});

test("rankCandidates: empty competitors and demand lists don't throw and everyone ties", () => {
  const points = [{ lat: 30.27, lng: -97.74 }, { lat: 30.28, lng: -97.75 }];
  const ranked = rankCandidates(points, [], [], { preferFar: true, preferNear: true, demandRadiusM: 500 });
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].score, ranked[1].score);
});

test("rankCandidates: a point exactly at a competitor gets distance 0, not null", () => {
  const p = { lat: 30.27, lng: -97.74 };
  const ranked = rankCandidates([p], [{ lat: 30.27, lng: -97.74 }], [], { preferFar: true });
  assert.equal(ranked[0].nearestCompetitorKm, 0);
});

test("rankCandidates: ties preserve original point order (stable sort)", () => {
  const points = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }];
  const ranked = rankCandidates(points, [], [], {});
  assert.deepEqual(ranked.map(p => `${p.lat},${p.lng}`), ["1,1", "2,2", "3,3"]);
});

test("rankCandidates: preferFar and preferNear produce different orders on the same data", () => {
  const near = { lat: 30.2700, lng: -97.7400 }; // close to the competitor, surrounded by demand
  const far = { lat: 30.3200, lng: -97.7900 };  // far from the competitor, no demand nearby
  const points = [near, far];
  const competitors = [{ lat: 30.2701, lng: -97.7401 }];
  const demandPoints = [
    { lat: 30.2701, lng: -97.7401 }, { lat: 30.2702, lng: -97.7402 }, { lat: 30.2703, lng: -97.7403 },
  ];
  const byFar = rankCandidates(points, competitors, demandPoints, { preferFar: true, demandRadiusM: 500 });
  const byNear = rankCandidates(points, competitors, demandPoints, { preferNear: true, demandRadiusM: 500 });
  assert.equal(byFar[0].lat, far.lat);
  assert.equal(byNear[0].lat, near.lat);
});

test("rankCandidates: a point with no competitors at all scores as maximally far", () => {
  const ranked = rankCandidates([{ lat: 30.27, lng: -97.74 }], [], [], { preferFar: true });
  assert.equal(ranked[0].nearestCompetitorKm, null);
  assert.ok(ranked[0].score > 0);
});

test("rankCandidates: counts demandPoints only within demandRadiusM", () => {
  const p = { lat: 30.2700, lng: -97.7400 };
  const demandPoints = [
    { lat: 30.2701, lng: -97.7401 }, // ~13m away
    { lat: 30.5000, lng: -97.7400 }, // ~26km away
  ];
  const ranked = rankCandidates([p], [], demandPoints, { preferNear: true, demandRadiusM: 100 });
  assert.equal(ranked[0].demandCount, 1);
});

test("rankCandidates: respects opts.limit and defaults to 6", () => {
  const points = Array.from({ length: 10 }, (_, i) => ({ lat: 30 + i * 0.01, lng: -97 }));
  assert.equal(rankCandidates(points, [], [], {}).length, 6);
  assert.equal(rankCandidates(points, [], [], { limit: 3 }).length, 3);
});

test("rankCandidates: never mutates the input points array", () => {
  const points = [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
  const snapshot = points.map(p => ({ ...p }));
  rankCandidates(points, [{ lat: 1, lng: 1 }], [], { preferFar: true });
  assert.deepEqual(points, snapshot);
});

test("rankCandidates: handles missing competitors/demandPoints/opts gracefully", () => {
  const ranked = rankCandidates([{ lat: 1, lng: 1 }], null, null, undefined);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].score, 0);
});

// ---- reverse search, step 3: parseOverpassPoints / reverseSearchSignals ----

test("parseOverpassPoints: reads lat/lon directly off node elements", () => {
  const json = { elements: [{ type: "node", lat: 30.1, lon: -97.1 }] };
  assert.deepEqual(parseOverpassPoints(json), [{ lat: 30.1, lng: -97.1 }]);
});

test("parseOverpassPoints: reads a way/relation's `center` object instead", () => {
  const json = { elements: [{ type: "way", center: { lat: 30.2, lon: -97.2 } }] };
  assert.deepEqual(parseOverpassPoints(json), [{ lat: 30.2, lng: -97.2 }]);
});

test("parseOverpassPoints: drops elements with neither lat/lon nor a center", () => {
  const json = { elements: [{ type: "node" }, { type: "way", center: null }] };
  assert.deepEqual(parseOverpassPoints(json), []);
});

test("parseOverpassPoints: keeps a real 0,0 coordinate rather than treating it as missing", () => {
  const json = { elements: [{ type: "node", lat: 0, lon: 0 }] };
  assert.deepEqual(parseOverpassPoints(json), [{ lat: 0, lng: 0 }]);
});

test("parseOverpassPoints: handles a missing/malformed response gracefully", () => {
  assert.deepEqual(parseOverpassPoints(null), []);
  assert.deepEqual(parseOverpassPoints({}), []);
  assert.deepEqual(parseOverpassPoints({ elements: null }), []);
});

test("reverseSearchSignals: a min_distance_km_from_nearest competition read turns preferFar on", () => {
  const sig = reverseSearchSignals({ competition: { min_distance_km_from_nearest: 1.0 } }, 0);
  assert.equal(sig.preferFar, true);
  assert.equal(sig.preferNear, false);
});

test("reverseSearchSignals: a rooftop-need threshold turns preferNear on", () => {
  const sig = reverseSearchSignals({}, 100000);
  assert.equal(sig.preferFar, false);
  assert.equal(sig.preferNear, true);
});

test("reverseSearchSignals: both signals can be on at once (the food-truck-court case)", () => {
  const sig = reverseSearchSignals({ competition: { min_distance_km_from_nearest: 1.0 } }, 1500);
  assert.equal(sig.preferFar, true);
  assert.equal(sig.preferNear, true);
});

test("reverseSearchSignals: a use with neither (e.g. data_center) gets both signals off", () => {
  const sig = reverseSearchSignals({}, 0);
  assert.equal(sig.preferFar, false);
  assert.equal(sig.preferNear, false);
});

test("reverseSearchSignals: a max_same_brand_in_trade_area competition read also turns preferFar on (warehouse_club's shape)", () => {
  const sig = reverseSearchSignals({ competition: { max_same_brand_in_trade_area: 0 } }, 100000);
  assert.equal(sig.preferFar, true);
  assert.equal(sig.preferNear, true);
});

test("reverseSearchSignals: handles a missing requires/competition block gracefully", () => {
  assert.deepEqual(reverseSearchSignals(null, 0), { preferFar: false, preferNear: false });
  assert.deepEqual(reverseSearchSignals(undefined, 5000), { preferFar: false, preferNear: true });
});

// ---- candidateWhyText / candidatesToCsvRows (reverse-search CSV export) ----

test("candidateWhyText: preferNear-only renders a rooftop count", () => {
  const r = { lat: 30.27, lng: -97.74, demandCount: 12, nearestCompetitorKm: 1.6 };
  const text = candidateWhyText(r, { preferNear: true, preferFar: false }, { radius: 1200, compLabel: "food vendors" });
  assert.equal(text, "≈12 rooftops within 1.2 km");
});

test("candidateWhyText: singular rooftop count doesn't pluralize", () => {
  const r = { lat: 30.27, lng: -97.74, demandCount: 1, nearestCompetitorKm: null };
  const text = candidateWhyText(r, { preferNear: true, preferFar: false }, { radius: 1200, compLabel: "food vendors" });
  assert.equal(text, "≈1 rooftop within 1.2 km");
});

test("candidateWhyText: preferFar-only with a competitor in range", () => {
  const r = { lat: 30.27, lng: -97.74, demandCount: 0, nearestCompetitorKm: 1.6 };
  const text = candidateWhyText(r, { preferNear: false, preferFar: true }, { radius: 1200, compLabel: "food vendors" });
  assert.equal(text, "nearest food vendor 1.6 km away");
});

test("candidateWhyText: preferFar-only with no competitor in range at all", () => {
  const r = { lat: 30.27, lng: -97.74, demandCount: 0, nearestCompetitorKm: null };
  const text = candidateWhyText(r, { preferNear: false, preferFar: true }, { radius: 1200, compLabel: "food vendors" });
  assert.equal(text, "no food vendors in range");
});

test("candidateWhyText: both signals on joins with a middle dot (food_truck_court's case)", () => {
  const r = { lat: 30.27, lng: -97.74, demandCount: 12, nearestCompetitorKm: 1.6 };
  const text = candidateWhyText(r, { preferNear: true, preferFar: true }, { radius: 1200, compLabel: "food vendors" });
  assert.equal(text, "≈12 rooftops within 1.2 km · nearest food vendor 1.6 km away");
});

test("candidateWhyText: neither signal on falls back to plain coordinates", () => {
  const r = { lat: 30.2672, lng: -97.7431, demandCount: 0, nearestCompetitorKm: null };
  const text = candidateWhyText(r, { preferNear: false, preferFar: false }, { radius: 1200, compLabel: "food vendors" });
  assert.equal(text, "30.2672, -97.7431");
});

test("candidatesToCsvRows: header row plus one row per candidate, rank/lat/lng/score/why", () => {
  const results = [
    { lat: 30.27, lng: -97.74, demandCount: 12, nearestCompetitorKm: 1.6, score: 13.6 },
    { lat: 30.28, lng: -97.75, demandCount: 4, nearestCompetitorKm: null, score: 1004 },
  ];
  const rows = candidatesToCsvRows(results, { preferNear: true, preferFar: true }, { radius: 1200, compLabel: "food vendors" });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], ["#", "Lat", "Lng", "Score", "Why"]);
  assert.deepEqual(rows[1], [1, 30.27, -97.74, 13.6, "≈12 rooftops within 1.2 km · nearest food vendor 1.6 km away"]);
  assert.deepEqual(rows[2], [2, 30.28, -97.75, 1004, "≈4 rooftops within 1.2 km · no food vendors in range"]);
});

test("candidatesToCsvRows: an empty candidate list still returns just the header row", () => {
  assert.deepEqual(candidatesToCsvRows([], { preferNear: true }, { radius: 1200 }), [["#", "Lat", "Lng", "Score", "Why"]]);
});

test("candidatesToCsvRows: handles a missing/null results list gracefully", () => {
  assert.deepEqual(candidatesToCsvRows(null, {}, {}), [["#", "Lat", "Lng", "Score", "Why"]]);
  assert.deepEqual(candidatesToCsvRows(undefined, {}, {}), [["#", "Lat", "Lng", "Score", "Why"]]);
});

test("candidatesToCsvRows: rows round-trip through toCsv (RFC-4180 output for a plain numeric/text shape)", () => {
  const results = [{ lat: 30.27, lng: -97.74, demandCount: 12, nearestCompetitorKm: 1.6, score: 13.6 }];
  const csv = toCsv(candidatesToCsvRows(results, { preferNear: true, preferFar: true }, { radius: 1200, compLabel: "food vendors" }));
  assert.equal(csv, "#,Lat,Lng,Score,Why\r\n1,30.27,-97.74,13.6,≈12 rooftops within 1.2 km · nearest food vendor 1.6 km away");
});

// ---- buildCandidatesReportText (reverse-search PDF/print report) ----

test("buildCandidatesReportText: header, center, radius, count, then one numbered line per candidate", () => {
  const results = [
    { lat: 30.27, lng: -97.74, demandCount: 12, nearestCompetitorKm: 1.6, score: 13.6 },
    { lat: 30.28, lng: -97.75, demandCount: 4, nearestCompetitorKm: null, score: 1004 },
  ];
  const t = buildCandidatesReportText(
    "Food Truck Court / Mobile Vending Site", { lat: 30.2672, lng: -97.7431 }, 1200,
    results, { preferNear: true, preferFar: true }, { radius: 1200, compLabel: "food vendors" },
  );
  assert.match(t, /^SIMyCity — candidate sites for "Food Truck Court \/ Mobile Vending Site"\n/);
  assert.match(t, /Search center: 30\.2672, -97\.7431 \(radius 1\.2 km\)/);
  assert.match(t, /2 candidates found/);
  assert.match(t, /1\. ≈12 rooftops within 1\.2 km · nearest food vendor 1\.6 km away \(score 13\.6\)/);
  assert.match(t, /2\. ≈4 rooftops within 1\.2 km · no food vendors in range \(score 1004\)/);
  assert.match(t, /github\.com\/jodeit\/simy_city/);
});

test("buildCandidatesReportText: singular 'candidate' for exactly one result", () => {
  const results = [{ lat: 30.27, lng: -97.74, demandCount: 12, nearestCompetitorKm: 1.6, score: 13.6 }];
  const t = buildCandidatesReportText("Warehouse Club", { lat: 30, lng: -97 }, 15000, results, { preferNear: true }, { radius: 15000 });
  assert.match(t, /1 candidate found/);
  assert.doesNotMatch(t, /1 candidates found/);
});

test("buildCandidatesReportText: a large radius (>=2km) renders whole kilometers, not one decimal", () => {
  const t = buildCandidatesReportText("Warehouse Club", { lat: 30, lng: -97 }, 15000, [], {}, { radius: 15000 });
  assert.match(t, /radius 15 km/);
});

test("buildCandidatesReportText: empty candidate list still renders a valid report, zero found", () => {
  const t = buildCandidatesReportText("Data Center", { lat: 30, lng: -97 }, 5000, [], {}, { radius: 5000 });
  assert.match(t, /0 candidates found/);
});

test("buildCandidatesReportText: missing/null results list doesn't throw", () => {
  assert.doesNotThrow(() => buildCandidatesReportText("Data Center", { lat: 30, lng: -97 }, 5000, null, {}, {}));
  assert.doesNotThrow(() => buildCandidatesReportText("Data Center", { lat: 30, lng: -97 }, 5000, undefined, {}, {}));
});

test("buildCandidatesReportText: missing/malformed center falls back to '?, ?' instead of throwing or emitting NaN", () => {
  assert.match(buildCandidatesReportText("Data Center", null, 5000, [], {}, {}), /Search center: \?, \?/);
  assert.match(buildCandidatesReportText("Data Center", {}, 5000, [], {}, {}), /Search center: \?, \?/);
});

// ---- buildCompareReportText (Compare-list PDF/print report) ----

test("buildCompareReportText: header, count, then one numbered section per pin with all fields", () => {
  const pins = [
    { label: "123 Main St", owner: "Smith, John Trust", acres: 2.5, value: 450000, land: "Retail", county: "Travis", use: "Fast casual restaurant", verdict: "PASS — clears the demand bar" },
    { lat: 30.28, lng: -97.75, owner: "Jane Doe", acres: 1.1, value: 200000, land: "Vacant", county: "Harris" },
  ];
  const t = buildCompareReportText(pins);
  assert.match(t, /^SIMyCity — parcel comparison\n/);
  assert.match(t, /2 parcels pinned/);
  assert.match(t, /1\. 123 Main St/);
  assert.match(t, /Owner: Smith, John Trust/);
  assert.match(t, /Acreage: 2\.50 ac/);
  assert.match(t, /Appraised value: \$450,000/);
  assert.match(t, /Land use: Retail/);
  assert.match(t, /County: Travis/);
  assert.match(t, /Testing: Fast casual restaurant/);
  assert.match(t, /Verdict: PASS — clears the demand bar/);
  assert.match(t, /2\. 30\.2800, -97\.7500/);
  assert.match(t, /github\.com\/jodeit\/simy_city/);
});

test("buildCompareReportText: singular 'parcel' for exactly one pin, and omits Testing/Verdict when absent (Explore-mode pin)", () => {
  const t = buildCompareReportText([{ label: "Empty lot", owner: "—", acres: 3, value: 100000, land: "Vacant", county: "Travis" }]);
  assert.match(t, /1 parcel pinned/);
  assert.doesNotMatch(t, /1 parcels pinned/);
  assert.doesNotMatch(t, /Testing:/);
  assert.doesNotMatch(t, /Verdict:/);
});

test("buildCompareReportText: empty/null/undefined pins list still renders a valid report, zero pinned, no throw", () => {
  assert.match(buildCompareReportText([]), /0 parcels pinned/);
  assert.doesNotThrow(() => buildCompareReportText(null));
  assert.doesNotThrow(() => buildCompareReportText(undefined));
  assert.match(buildCompareReportText(null), /0 parcels pinned/);
});

test("buildCompareReportText: missing/malformed fields render '—' instead of 'undefined', and a null pin in the list doesn't throw", () => {
  const t = buildCompareReportText([{}, null]);
  assert.match(t, /1\. \?, \?/);
  assert.match(t, /Owner: —/);
  assert.match(t, /Acreage: —/);
  assert.match(t, /Appraised value: —/);
  assert.match(t, /Land use: —/);
  assert.match(t, /County: —/);
  assert.match(t, /2\. \?, \?/);
});

// ---- minimal hand-rolled PDF writer ("make the case" PDF export) ----

test("toPdfSafeText: maps the known non-Latin-1 characters buildCaseText() emits to ASCII", () => {
  assert.equal(toPdfSafeText("SIMyCity — test"), "SIMyCity - test");
  assert.equal(toPdfSafeText("• Developer: favorable"), "* Developer: favorable");
  assert.equal(toPdfSafeText("a → b → c"), "a -> b -> c");
});

test("toPdfSafeText: passes plain ASCII/Latin-1 text through unchanged", () => {
  assert.equal(toPdfSafeText("Verdict: CONTESTED (30.2672, -97.7431)"), "Verdict: CONTESTED (30.2672, -97.7431)");
});

test("toPdfSafeText: falls back to '?' for characters outside Latin-1 with no explicit mapping", () => {
  assert.equal(toPdfSafeText("🌱 emoji"), "? emoji");
});

test("escapePdfString: backslash-escapes parens and backslashes for a PDF literal string", () => {
  assert.equal(escapePdfString("a(b)c"), "a\\(b\\)c");
  assert.equal(escapePdfString("a\\b"), "a\\\\b");
});

test("buildSimplePdf: produces a well-formed PDF header/trailer around the content", () => {
  const pdf = buildSimplePdf(["hello", "world"]);
  assert.ok(pdf.startsWith("%PDF-1.4\n"));
  assert.ok(pdf.trimEnd().endsWith("%%EOF"));
  assert.match(pdf, /\/Type \/Catalog/);
  assert.match(pdf, /\/Type \/Pages/);
  assert.match(pdf, /\/Type \/Font \/Subtype \/Type1 \/BaseFont \/Courier/);
  assert.match(pdf, /\(hello\) Tj/);
  assert.match(pdf, /\(world\) Tj/);
});

test("buildSimplePdf: paginates when the line count exceeds one page's capacity", () => {
  const manyLines = Array.from({ length: 120 }, (_, i) => `line ${i}`);
  const pdf = buildSimplePdf(manyLines, { margin: 54, lineHeight: 14 }); // (792-108)/14 ≈ 48/page → 3 pages
  const pageCount = (pdf.match(/\/Type \/Page(?!s)/g) || []).length;
  assert.equal(pageCount, 3);
  assert.match(pdf, /\/Count 3/);
});

test("buildSimplePdf: an empty line list still produces a valid single-page PDF", () => {
  const pdf = buildSimplePdf([]);
  assert.ok(pdf.startsWith("%PDF-1.4\n"));
  assert.match(pdf, /\/Count 1/);
});

test("buildSimplePdf: sanitizes lines through toPdfSafeText before writing (no raw non-Latin-1 bytes)", () => {
  const pdf = buildSimplePdf(["SIMyCity — café"]);
  assert.match(pdf, /\(SIMyCity - caf.\) Tj/);
  assert.equal([...pdf].some(ch => ch.codePointAt(0) > 255), false);
});

test("buildSimplePdf: every character in the output is a single byte (safe for Uint8Array.from(str, c => c.charCodeAt(0)))", () => {
  const pdf = buildSimplePdf(["a line with a (paren) and a \\backslash\\"]);
  assert.equal([...pdf].every(ch => ch.codePointAt(0) <= 255), true);
});

// ---- traffic-count (AADT) leg: parseAadtFeatures / maxAadtWithinRadius ----

test("parseAadtFeatures: reads a confirmed AADT field off point geometry", () => {
  const json = { features: [{ attributes: { AADT: 42000 }, geometry: { x: -97.7, y: 30.3 } }] };
  assert.deepEqual(parseAadtFeatures(json), [{ lat: 30.3, lng: -97.7, aadt: 42000, route: null }]);
});

test("parseAadtFeatures: falls back through the candidate field list when AADT itself is absent", () => {
  const json = { features: [{ attributes: { CURRENT_AADT: "18000" }, geometry: { x: -97.7, y: 30.3 } }] };
  assert.equal(parseAadtFeatures(json)[0].aadt, 18000);
});

test("parseAadtFeatures: reads a route name when present", () => {
  const json = { features: [{ attributes: { AADT: 5000, ROUTE_NAME: "US-290" }, geometry: { x: -97.7, y: 30.3 } }] };
  assert.equal(parseAadtFeatures(json)[0].route, "US-290");
});

test("parseAadtFeatures: falls back to a polyline's first vertex when geometry has no x/y", () => {
  const json = { features: [{ attributes: { AADT: 9000 }, geometry: { paths: [[[-97.5, 30.1], [-97.4, 30.2]]] } }] };
  assert.deepEqual(parseAadtFeatures(json), [{ lat: 30.1, lng: -97.5, aadt: 9000, route: null }]);
});

test("parseAadtFeatures: drops a feature with no usable AADT number", () => {
  const json = { features: [
    { attributes: {}, geometry: { x: -97.7, y: 30.3 } },
    { attributes: { AADT: "not-a-number" }, geometry: { x: -97.7, y: 30.3 } },
    { attributes: { AADT: -5 }, geometry: { x: -97.7, y: 30.3 } },
  ] };
  assert.deepEqual(parseAadtFeatures(json), []);
});

test("parseAadtFeatures: drops a feature with no usable coordinate (neither point nor polyline)", () => {
  const json = { features: [{ attributes: { AADT: 1000 }, geometry: {} }] };
  assert.deepEqual(parseAadtFeatures(json), []);
});

test("parseAadtFeatures: handles a missing/malformed response gracefully", () => {
  assert.deepEqual(parseAadtFeatures(null), []);
  assert.deepEqual(parseAadtFeatures({}), []);
  assert.deepEqual(parseAadtFeatures({ features: null }), []);
});

test("maxAadtWithinRadius: picks the busiest point in range, not the literal nearest", () => {
  const center = { lat: 30.0, lng: -97.0 };
  const near = { lat: 30.001, lng: -97.0, aadt: 3000 }; // ~111m away, quiet
  const busy = { lat: 30.005, lng: -97.0, aadt: 50000 }; // ~555m away, busy
  const best = maxAadtWithinRadius([near, busy], center, 1000);
  assert.equal(best.aadt, 50000);
});

test("maxAadtWithinRadius: excludes points outside the radius", () => {
  const center = { lat: 30.0, lng: -97.0 };
  const far = { lat: 30.5, lng: -97.0, aadt: 90000 }; // way outside 1km
  assert.equal(maxAadtWithinRadius([far], center, 1000), null);
});

test("maxAadtWithinRadius: returns null for an empty point list", () => {
  assert.equal(maxAadtWithinRadius([], { lat: 30, lng: -97 }, 1000), null);
});

test("maxAadtWithinRadius: returns null for a missing/invalid center", () => {
  assert.equal(maxAadtWithinRadius([{ lat: 30, lng: -97, aadt: 1000 }], null, 1000), null);
  assert.equal(maxAadtWithinRadius([{ lat: 30, lng: -97, aadt: 1000 }], {}, 1000), null);
});

test("maxAadtWithinRadius: carries the route name through on the winning point", () => {
  const center = { lat: 30.0, lng: -97.0 };
  const hit = { lat: 30.001, lng: -97.0, aadt: 40000, route: "I-35" };
  assert.equal(maxAadtWithinRadius([hit], center, 1000).route, "I-35");
});
