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
  countOf, haversine, inBbox, pick, blendedDemand,
  parseFccBlockFips, parseAcsTractRow, makeSessionCache, wrapText, debounce,
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
