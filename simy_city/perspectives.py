"""Multi-stakeholder evaluation — the "should we develop?" question.

Feasibility ("can it be built?") and market success ("will it succeed?") are not
the same as desirability ("*should* it be built?"). The last question has no
single answer: a developer, an existing resident, an environmentalist, and the
municipality weigh the same parcel differently. This module scores a land use
through each lens (defined in ``layers.yaml`` → ``stakeholders``) so the trade-off
is explicit. SIMyCity's role is to surface the tension, not to pick a winner.

It runs on the declarative model alone (the ``impacts`` block on each land use),
so it works today. At M2 the severities can be replaced by values measured from
the ecology data sources (USFWS habitat, NLCD impervious, etc.) at a real parcel.

    >>> from simy_city import load_registry
    >>> from simy_city.perspectives import evaluate
    >>> for view in evaluate(load_registry(), "data_center"):
    ...     print(view.stakeholder, view.leaning)
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .registry import Registry

_SEVERITY = {"low": 1, "medium": 2, "high": 3, "none": 0}
_AMENITY_USES = {"warehouse_club", "fast_casual"}  # uses that are themselves amenities


@dataclass
class Perspective:
    """How one stakeholder leans on one land use, with the reasons why."""

    stakeholder: str
    label: str
    question: str
    leaning: str               # favorable | mixed | opposed
    reasons: list[str] = field(default_factory=list)


def _severity(value) -> int:
    return _SEVERITY.get(str(value).lower(), 0)


def evaluate(reg: Registry, use_id: str) -> list[Perspective]:
    use = reg.land_uses.get(use_id)
    if use is None:
        raise KeyError(use_id)
    impacts = use.get("impacts", {}) or {}
    induced = use.get("induces", {}) or {}

    views: list[Perspective] = []
    for sid, cfg in reg.stakeholders.items():
        reasons: list[str] = []
        score = 0  # positive = leans toward building, negative = leans against

        if cfg.get("pro_build"):
            score += 2
            reasons.append("baseline interest in development happening")

        # Impact opposition: each opposed impact dimension subtracts its severity.
        for dim in cfg.get("opposes_impacts", []) or []:
            sev = _severity(impacts.get(dim))
            if sev:
                score -= sev
                reasons.append(f"{dim} impact = {impacts.get(dim)}")

        # Structural opposition: each induced public service is a borne cost.
        if "induces" in (cfg.get("opposes_structure", []) or []):
            n = len(induced)
            if n:
                score -= n
                reasons.append(f"{n} induced public service(s) to fund")

        # Amenity seekers credit uses that are themselves amenities.
        if cfg.get("amenity_seeker") and use_id in _AMENITY_USES:
            score += 2
            reasons.append("adds a local amenity")

        # Coarse, deliberately tunable thresholds. "opposed" is reserved for a
        # meaningful burden (e.g. a high-severity impact or several stacked ones),
        # so minor uses land at "mixed" rather than reading as villains.
        if score > 1:
            leaning = "favorable"
        elif score <= -4:
            leaning = "opposed"
        else:
            leaning = "mixed"

        views.append(
            Perspective(
                stakeholder=sid,
                label=cfg.get("label", sid),
                question=cfg.get("question", ""),
                leaning=leaning,
                reasons=reasons or ["no strongly weighted factors in the model"],
            )
        )
    return views


def contested(reg: Registry, use_id: str) -> bool:
    """True when stakeholders disagree — i.e. there's a real values trade-off."""
    leanings = {v.leaning for v in evaluate(reg, use_id)}
    return "favorable" in leanings and "opposed" in leanings
