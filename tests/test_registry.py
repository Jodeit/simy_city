"""Validation tests for the public-data source registry.

These run in CI so a contributor (or a spare-token agent) editing the YAML gets
immediate feedback if they break the schema or wire a source to a layer that
doesn't exist.
"""

from __future__ import annotations

import pytest

from simy_city.registry import load_registry


@pytest.fixture(scope="module")
def reg():
    return load_registry()


def test_registry_loads_and_validates(reg):
    assert len(reg.sources) >= 15
    assert reg.meta.get("testbed_zip") == "78738"


def test_every_source_has_docs_and_layers(reg):
    for s in reg.sources:
        assert s.docs_url, f"{s.id} missing docs_url"
        assert s.layers, f"{s.id} has no service layers"
        assert s.relevance_78738, f"{s.id} missing 78738 relevance note"


def test_layer_measured_by_resolves(reg):
    source_ids = {s.id for s in reg.sources}
    for layer in reg.layers.values():
        for sid in layer.measured_by:
            assert sid in source_ids, f"{layer.id} -> unknown source {sid}"


def test_land_use_requirements_reference_known_layers(reg):
    for use, body in reg.land_uses.items():
        for lid in (body.get("requires") or {}):
            assert lid in reg.layers, f"{use} requires unknown layer {lid}"


def test_coverage_report_covers_all_layers(reg):
    report = reg.coverage_report()
    assert set(report) == set(reg.layers)
    # The flagship data-center dependency trio must each have a source.
    for layer in ("power", "water", "broadband"):
        assert report[layer] >= 1


def test_data_center_dependencies_present(reg):
    dc = reg.land_uses["data_center"]
    assert {"power", "water", "broadband"} <= set(dc["requires"])


def test_enabling_edges_reference_known_uses(reg):
    uses = reg.all_use_ids()
    assert reg.enabling_edges, "expected enabling edges to be defined"
    for edge in reg.enabling_edges:
        assert edge["from"] in uses
        assert edge["to"] in uses


def test_housing_retail_standoff_is_detected(reg):
    from simy_city.standoffs import find_standoffs

    standoffs = find_standoffs(reg)
    assert standoffs, "model should contain at least one chicken-and-egg standoff"
    # The canonical loop: housing <-> retail must appear in some cycle.
    found = any(
        "residential_subdivision" in s.cycle
        and any(u in s.cycle for u in ("warehouse_club", "fast_casual"))
        for s in standoffs
    )
    assert found, "expected a housing <-> retail standoff"


def test_present_use_breaks_standoff(reg):
    from simy_city.standoffs import find_standoffs

    base = find_standoffs(reg)
    # If housing already exists, cycles through it should disappear.
    filtered = find_standoffs(reg, present={"residential_subdivision"})
    assert len(filtered) < len(base)


def test_standoff_breaker_picks_cheapest_edge(reg):
    from simy_city.standoffs import find_standoffs

    for s in find_standoffs(reg):
        costs = [e.get("breaker_cost", "high") for e in s.edges]
        assert s.breaker.get("breaker_cost") == min(costs, key=lambda c: {"low": 0, "medium": 1, "high": 2}[c])


def test_every_land_use_has_impacts(reg):
    for use, body in reg.land_uses.items():
        assert body.get("impacts"), f"{use} missing impacts profile"


def test_stakeholders_defined(reg):
    assert {"developer", "resident", "environmentalist", "municipality"} <= set(reg.stakeholders)


def test_perspectives_cover_all_stakeholders(reg):
    from simy_city.perspectives import evaluate

    views = evaluate(reg, "data_center")
    assert {v.stakeholder for v in views} == set(reg.stakeholders)
    for v in views:
        assert v.leaning in {"favorable", "mixed", "opposed"}


def test_data_center_is_contested(reg):
    from simy_city.perspectives import contested, evaluate

    # Environmentalist should oppose the high-carbon/high-water data center while
    # a pro-build stakeholder favors it — i.e. a genuine values trade-off.
    env = next(v for v in evaluate(reg, "data_center") if v.stakeholder == "environmentalist")
    assert env.leaning == "opposed"
    assert contested(reg, "data_center")
