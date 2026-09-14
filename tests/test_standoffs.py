"""Isolated unit tests for `simy_city.standoffs.find_standoffs`/`Standoff`.

`test_registry.py` already exercises `find_standoffs` against the *real*
`layers.yaml` model (the canonical housing<->retail cycle, `present`
filtering, breaker-cost selection), which is the right place for "does the
actual model behave" checks. What's been missing is coverage of the
cycle-finding algorithm itself against small, synthetic graphs — the shapes
that are easy to get wrong (3+ node cycles, two disjoint cycles, a self-loop,
a tie in `breaker_cost`, the `reg=None` fallback in `describe()`/`label_for`)
but rare or absent in the one real model, so a regression there wouldn't
necessarily show up against `layers.yaml` alone.
"""

from __future__ import annotations

from simy_city.registry import Registry
from simy_city.standoffs import find_standoffs


def _edge(a, b, via="thing", cost="medium"):
    return {"from": a, "to": b, "via": via, "breaker_cost": cost}


def _reg(edges, land_uses=None, actor_uses=None):
    return Registry(
        meta={},
        sources=[],
        layers={},
        land_uses=land_uses or {},
        enabling_edges=edges,
        actor_uses=actor_uses or {},
    )


def test_two_node_cycle_is_detected():
    reg = _reg([_edge("A", "B"), _edge("B", "A")])
    standoffs = find_standoffs(reg)
    assert len(standoffs) == 1
    assert set(standoffs[0].cycle[:-1]) == {"A", "B"}


def test_three_node_cycle_is_detected():
    reg = _reg([_edge("A", "B"), _edge("B", "C"), _edge("C", "A")])
    standoffs = find_standoffs(reg)
    assert len(standoffs) == 1
    assert set(standoffs[0].cycle[:-1]) == {"A", "B", "C"}


def test_two_disjoint_cycles_both_found():
    reg = _reg([_edge("A", "B"), _edge("B", "A"), _edge("X", "Y"), _edge("Y", "X")])
    standoffs = find_standoffs(reg)
    node_sets = {frozenset(s.cycle[:-1]) for s in standoffs}
    assert node_sets == {frozenset({"A", "B"}), frozenset({"X", "Y"})}


def test_no_cycle_returns_empty():
    reg = _reg([_edge("A", "B"), _edge("B", "C")])
    assert find_standoffs(reg) == []


def test_self_loop_is_not_a_standoff():
    # A use "enabling" itself isn't a real chicken-and-egg cycle.
    reg = _reg([_edge("A", "A")])
    assert find_standoffs(reg) == []


def test_cycle_not_double_counted_from_either_start_node():
    reg = _reg([_edge("A", "B"), _edge("B", "A")])
    standoffs = find_standoffs(reg)
    # Traversal starts from every node in the adjacency map (both A and B
    # here), but the same undirected cycle should only be reported once.
    assert len(standoffs) == 1


def test_present_use_removes_edges_touching_it():
    reg = _reg([_edge("A", "B"), _edge("B", "A")])
    assert find_standoffs(reg, present={"A"}) == []
    assert find_standoffs(reg, present={"B"}) == []
    assert len(find_standoffs(reg, present=set())) == 1


def test_present_none_defaults_to_no_filter():
    reg = _reg([_edge("A", "B"), _edge("B", "A")])
    assert find_standoffs(reg) == find_standoffs(reg, present=None)


def test_breaker_picks_lowest_cost_edge():
    reg = _reg(
        [
            _edge("A", "B", via="power", cost="high"),
            _edge("B", "A", via="rooftops", cost="low"),
        ]
    )
    (standoff,) = find_standoffs(reg)
    assert standoff.breaker["via"] == "rooftops"


def test_breaker_tie_picks_one_of_the_tied_edges():
    reg = _reg(
        [
            _edge("A", "B", via="power", cost="medium"),
            _edge("B", "A", via="rooftops", cost="medium"),
        ]
    )
    (standoff,) = find_standoffs(reg)
    assert standoff.breaker["via"] in {"power", "rooftops"}


def test_breaker_missing_cost_defaults_to_high_rank():
    reg = _reg(
        [
            {"from": "A", "to": "B", "via": "power"},  # no breaker_cost at all
            _edge("B", "A", via="rooftops", cost="low"),
        ]
    )
    (standoff,) = find_standoffs(reg)
    assert standoff.breaker["via"] == "rooftops"


def test_label_for_uses_land_use_label():
    reg = _reg(
        [_edge("housing", "retail"), _edge("retail", "housing")],
        land_uses={"housing": {"label": "New Housing"}},
    )
    (standoff,) = find_standoffs(reg)
    assert standoff.label_for(reg, "housing") == "New Housing"


def test_label_for_uses_actor_use_label():
    reg = _reg(
        [_edge("developer", "city"), _edge("city", "developer")],
        actor_uses={"city": {"label": "City Council"}},
    )
    (standoff,) = find_standoffs(reg)
    assert standoff.label_for(reg, "city") == "City Council"


def test_label_for_falls_back_to_raw_id():
    reg = _reg([_edge("A", "B"), _edge("B", "A")])
    (standoff,) = find_standoffs(reg)
    assert standoff.label_for(reg, "A") == "A"


def test_describe_without_reg_uses_raw_ids():
    reg = _reg(
        [_edge("housing", "retail"), _edge("retail", "housing")],
        land_uses={"housing": {"label": "New Housing"}, "retail": {"label": "Retail"}},
    )
    (standoff,) = find_standoffs(reg)
    text = standoff.describe()
    assert "housing" in text
    assert "New Housing" not in text


def test_describe_with_reg_substitutes_labels():
    reg = _reg(
        [_edge("housing", "retail"), _edge("retail", "housing")],
        land_uses={"housing": {"label": "New Housing"}, "retail": {"label": "Retail"}},
    )
    (standoff,) = find_standoffs(reg)
    text = standoff.describe(reg)
    assert "New Housing" in text
    assert "Retail" in text


def test_describe_mentions_the_breaker():
    reg = _reg([_edge("A", "B", via="rooftops", cost="low"), _edge("B", "A", via="power", cost="high")])
    (standoff,) = find_standoffs(reg)
    text = standoff.describe()
    assert "rooftops" in text
