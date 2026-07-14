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
  tractFipsFromBlockFips, cleanAcsValue, parseAcsRow,
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

// ---- Census ACS tract lookup (tractFipsFromBlockFips / cleanAcsValue / parseAcsRow) ----

test("tractFipsFromBlockFips: splits a 15-digit block FIPS into state/county/tract", () => {
  // 484530017021009: TX(48) Travis County(453) tract 001702 block 1009
  assert.deepEqual(tractFipsFromBlockFips("484530017021009"), { state: "48", county: "453", tract: "001702" });
});

test("tractFipsFromBlockFips: null on missing or too-short input", () => {
  assert.equal(tractFipsFromBlockFips(null), null);
  assert.equal(tractFipsFromBlockFips(""), null);
  assert.equal(tractFipsFromBlockFips("1234"), null);
});

test("cleanAcsValue: passes through real numbers, nulls ACS's missing-data sentinel", () => {
  assert.equal(cleanAcsValue("87500"), 87500);
  assert.equal(cleanAcsValue("-666666666"), null);
  assert.equal(cleanAcsValue(null), null);
});

test("parseAcsRow: zips ACS5's [headers, values] response shape into a cleaned map", () => {
  const headers = ["B01003_001E", "B19013_001E", "state", "county", "tract"];
  const values = ["3120", "-666666666", "48", "453", "001702"];
  const row = parseAcsRow(headers, values);
  assert.equal(row.B01003_001E, 3120);
  assert.equal(row.B19013_001E, null); // sentinel for no data in this tract
  assert.equal(row.tract, 1702); // non-numeric-looking codes still coerce through cleanAcsValue; callers keep FIPS as strings separately
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
