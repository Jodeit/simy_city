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
