"""Load, validate and query the public-data source registry.

The registry (``data_sources/registry.yaml``) and the service-layer model
(``data_sources/layers.yaml``) are the heart of this milestone. This module turns
them into typed objects and provides the queries the rest of the system needs:

    >>> reg = load_registry()
    >>> reg.for_layer("power")            # which sources feed the power layer
    >>> reg.needing_connector()           # contributor-pickup list (status == none)
    >>> reg.coverage_report()             # how many sources per service layer

It deliberately has *no* heavy dependencies beyond PyYAML so it runs anywhere a
contributor's spare-token agent might execute it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import yaml

# Repo layout: <root>/simy_city/registry.py and <root>/data_sources/*.yaml
_DATA_DIR = Path(__file__).resolve().parent.parent / "data_sources"

VALID_AUTH = {"none", "free_api_key", "free_account", "registration"}
VALID_ACCESS_TYPE = {
    "api",
    "rest_geojson",
    "wms",
    "wfs",
    "bulk_download",
    "scrape",
}
VALID_CONNECTOR_STATUS = {"none", "stub", "partial", "done"}


@dataclass
class Source:
    """One public dataset and how to reach it."""

    id: str
    name: str
    provider: str
    category: str
    layers: list[str]
    coverage: str
    access: dict
    key_fields: list[str] = field(default_factory=list)
    update_frequency: str = ""
    license: str = ""
    relevance_78738: str = ""
    docs_url: str = ""
    connector_status: str = "none"

    @property
    def auth(self) -> str:
        return self.access.get("auth", "none")

    @property
    def needs_key(self) -> bool:
        return self.auth in {"free_api_key", "free_account", "registration"}


@dataclass
class Layer:
    """A SimCity-style service layer a development draws on."""

    id: str
    label: str
    provides: str
    measured_by: list[str]
    capacity_unit: str


@dataclass
class Registry:
    meta: dict
    sources: list[Source]
    layers: dict[str, Layer]
    land_uses: dict
    enabling_edges: list[dict] = field(default_factory=list)
    actor_uses: dict = field(default_factory=dict)
    stakeholders: dict = field(default_factory=dict)

    def all_use_ids(self) -> set[str]:
        """Land uses plus lightweight actor-uses referenced by enabling edges."""
        return set(self.land_uses) | set(self.actor_uses)

    # ---- lookups -----------------------------------------------------------
    def get(self, source_id: str) -> Source:
        for s in self.sources:
            if s.id == source_id:
                return s
        raise KeyError(source_id)

    def for_layer(self, layer_id: str) -> list[Source]:
        """Sources that feed a given service layer."""
        return [s for s in self.sources if layer_id in s.layers]

    def for_category(self, category: str) -> list[Source]:
        return [s for s in self.sources if s.category == category]

    def needing_connector(self) -> list[Source]:
        """Sources a contributor (human or agent) could pick up next."""
        return [s for s in self.sources if s.connector_status in {"none", "stub"}]

    def coverage_report(self) -> dict[str, int]:
        """Count of sources per service layer (find the thin spots)."""
        counts = {lid: 0 for lid in self.layers}
        for s in self.sources:
            for lid in s.layers:
                counts[lid] = counts.get(lid, 0) + 1
        return counts


# --------------------------------------------------------------------------- #
# Loading & validation
# --------------------------------------------------------------------------- #
def _read_yaml(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def load_registry(data_dir: Path | str | None = None) -> Registry:
    """Load and validate the registry + layer model from ``data_sources/``.

    Raises ``ValueError`` with an aggregated message if anything is malformed,
    so CI (and contributor agents) get one clear report instead of a stack trace.
    """
    base = Path(data_dir) if data_dir else _DATA_DIR
    reg_doc = _read_yaml(base / "registry.yaml")
    lay_doc = _read_yaml(base / "layers.yaml")

    layers: dict[str, Layer] = {}
    for lid, ldata in (lay_doc.get("layers") or {}).items():
        layers[lid] = Layer(
            id=lid,
            label=ldata.get("label", lid),
            provides=ldata.get("provides", ""),
            measured_by=list(ldata.get("measured_by", [])),
            capacity_unit=ldata.get("capacity_unit", ""),
        )

    sources = [
        Source(
            id=s["id"],
            name=s["name"],
            provider=s["provider"],
            category=s["category"],
            layers=list(s.get("layers", [])),
            coverage=s.get("coverage", ""),
            access=s.get("access", {}),
            key_fields=list(s.get("key_fields", [])),
            update_frequency=s.get("update_frequency", ""),
            license=s.get("license", ""),
            relevance_78738=s.get("relevance_78738", ""),
            docs_url=s.get("docs_url", ""),
            connector_status=s.get("connector_status", "none"),
        )
        for s in (reg_doc.get("sources") or [])
    ]

    reg = Registry(
        meta=reg_doc.get("meta", {}),
        sources=sources,
        layers=layers,
        land_uses=lay_doc.get("land_uses", {}),
        enabling_edges=list(lay_doc.get("enabling_edges", []) or []),
        actor_uses=lay_doc.get("actor_uses", {}) or {},
        stakeholders=lay_doc.get("stakeholders", {}) or {},
    )
    _validate(reg)
    return reg


def _validate(reg: Registry) -> None:
    errors: list[str] = []

    ids = [s.id for s in reg.sources]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        errors.append(f"duplicate source ids: {sorted(dupes)}")

    known_layers = set(reg.layers)
    for s in reg.sources:
        if s.auth not in VALID_AUTH:
            errors.append(f"{s.id}: invalid auth '{s.auth}'")
        atype = s.access.get("type")
        if atype not in VALID_ACCESS_TYPE:
            errors.append(f"{s.id}: invalid access.type '{atype}'")
        if s.connector_status not in VALID_CONNECTOR_STATUS:
            errors.append(f"{s.id}: invalid connector_status '{s.connector_status}'")
        for lid in s.layers:
            if lid not in known_layers:
                errors.append(f"{s.id}: references unknown layer '{lid}'")

    # Every layer's measured_by must point at real sources.
    source_ids = set(ids)
    for layer in reg.layers.values():
        for sid in layer.measured_by:
            if sid not in source_ids:
                errors.append(f"layer '{layer.id}': measured_by unknown source '{sid}'")

    # Land-use requirements must reference known layers.
    for use, body in reg.land_uses.items():
        for lid in (body.get("requires") or {}):
            if lid not in known_layers:
                errors.append(f"land_use '{use}': requires unknown layer '{lid}'")
        for lid in (body.get("induces") or {}):
            if lid not in known_layers:
                errors.append(f"land_use '{use}': induces unknown layer '{lid}'")

    # Enabling edges must reference known uses (land uses or actor uses).
    known_uses = reg.all_use_ids()
    for i, edge in enumerate(reg.enabling_edges):
        for end in ("from", "to"):
            if edge.get(end) not in known_uses:
                errors.append(f"enabling_edges[{i}]: '{end}' references unknown use '{edge.get(end)}'")

    if errors:
        raise ValueError("registry validation failed:\n  - " + "\n  - ".join(errors))


def iter_sources(reg: Registry | None = None) -> Iterable[Source]:
    return (reg or load_registry()).sources
