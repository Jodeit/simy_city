"""Chicken-and-egg standoff detection.

A *standoff* is a cycle in the enabling-edge graph among uses that are all
currently **absent** from a place: retail won't come without rooftops, but a
housing developer won't build rooftops without the demand that retail (and jobs,
and amenities) would provide. Each actor rationally waits for another, so nothing
gets built — even when every individual project would be viable once the others
exist.

This module finds those cycles from the declarative model in ``layers.yaml``
(``enabling_edges``). It needs no external data, so it runs today. Once the M1
connectors land, ``present`` can be populated from real POI/parcel data so the
detector only flags cycles that are *actually* stuck on the ground.

    >>> from simy_city import load_registry
    >>> from simy_city.standoffs import find_standoffs
    >>> for s in find_standoffs(load_registry()):
    ...     print(s.describe())
"""

from __future__ import annotations

from dataclasses import dataclass

from .registry import Registry

_COST_RANK = {"low": 0, "medium": 1, "high": 2}


@dataclass
class Standoff:
    """A cycle of mutually-blocking absent uses."""

    cycle: list[str]              # use ids forming the loop, e.g. [A, B, A]
    edges: list[dict]             # the enabling_edges traversed (with via/breaker_cost)

    @property
    def breaker(self) -> dict:
        """The cheapest edge to supply directly — where a public actor unsticks it."""
        return min(self.edges, key=lambda e: _COST_RANK.get(e.get("breaker_cost", "high"), 2))

    def label_for(self, reg: Registry, use_id: str) -> str:
        body = reg.land_uses.get(use_id) or reg.actor_uses.get(use_id) or {}
        return body.get("label", use_id)

    def describe(self, reg: Registry | None = None) -> str:
        names = self.cycle
        if reg is not None:
            names = [self.label_for(reg, u) for u in self.cycle]
        loop = " → ".join(names)
        b = self.breaker
        return (
            f"STANDOFF: {loop}\n"
            f"  each waits on the next; none moves first.\n"
            f"  cheapest break: supply \"{b.get('via')}\" "
            f"(from {b.get('from')} → {b.get('to')}, cost={b.get('breaker_cost')})."
        )


def _build_adj(reg: Registry, present: set[str]) -> dict[str, list[dict]]:
    """Adjacency over enabling edges, skipping any use already present."""
    adj: dict[str, list[dict]] = {}
    for edge in reg.enabling_edges:
        a, b = edge.get("from"), edge.get("to")
        if a in present or b in present:
            continue
        adj.setdefault(a, []).append(edge)
    return adj


def find_standoffs(reg: Registry, present: set[str] | None = None) -> list[Standoff]:
    """Return every simple cycle of absent uses in the enabling-edge graph.

    `present` = uses that already exist in the place under study; edges touching
    them are removed before the search (a present use isn't waiting on anyone).
    With `present=None` (the default) we surface every *structural* standoff the
    model contains — useful for understanding the dynamics before we have data.
    """
    present = present or set()
    adj = _build_adj(reg, present)

    standoffs: list[Standoff] = []
    seen: set[frozenset[str]] = set()

    def dfs(start: str, node: str, path_nodes: list[str], path_edges: list[dict]):
        for edge in adj.get(node, []):
            nxt = edge["to"]
            if nxt == start and len(path_edges) >= 1:
                cycle_set = frozenset(path_nodes)
                if cycle_set not in seen:
                    seen.add(cycle_set)
                    standoffs.append(Standoff(cycle=path_nodes + [start], edges=path_edges + [edge]))
                continue
            if nxt in path_nodes:
                continue  # a different, inner cycle — found when its own start is used
            dfs(start, nxt, path_nodes + [nxt], path_edges + [edge])

    for use in adj:
        dfs(use, use, [use], [])

    return standoffs
