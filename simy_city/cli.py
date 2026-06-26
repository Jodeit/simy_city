"""A tiny CLI to explore the registry — the first usable surface of simy_city.

    python -m simy_city.cli report          # source count per service layer
    python -m simy_city.cli layer power      # sources feeding the power layer
    python -m simy_city.cli todo            # connectors a contributor can pick up
    python -m simy_city.cli use data_center  # dependency profile of a land use
    python -m simy_city.cli standoffs       # chicken-and-egg standoffs in the model
    python -m simy_city.cli perspectives data_center  # "should we?" by stakeholder
    python -m simy_city.cli validate        # exit non-zero if registry is broken
"""

from __future__ import annotations

import sys

from .perspectives import contested, evaluate
from .registry import Registry, load_registry
from .standoffs import find_standoffs


def _print_sources(sources) -> None:
    for s in sources:
        key = " (needs free key)" if s.needs_key else ""
        print(f"  • {s.id:18s} {s.name}{key}")


def cmd_report(reg: Registry) -> int:
    print(f"simy_city registry v{reg.meta.get('version', '?')} "
          f"— {len(reg.sources)} sources, testbed ZIP {reg.meta.get('testbed_zip')}\n")
    print("Sources per service layer:")
    for lid, n in sorted(reg.coverage_report().items(), key=lambda kv: -kv[1]):
        bar = "█" * n
        flag = "  <-- THIN" if n <= 1 else ""
        print(f"  {lid:16s} {n:2d} {bar}{flag}")
    return 0


def cmd_layer(reg: Registry, layer_id: str) -> int:
    if layer_id not in reg.layers:
        print(f"unknown layer '{layer_id}'. known: {', '.join(reg.layers)}")
        return 1
    print(f"Sources feeding layer '{layer_id}' ({reg.layers[layer_id].label}):")
    _print_sources(reg.for_layer(layer_id))
    return 0


def cmd_todo(reg: Registry) -> int:
    todo = reg.needing_connector()
    print(f"{len(todo)} sources still need a connector (status none/stub):")
    _print_sources(todo)
    return 0


def cmd_use(reg: Registry, use_id: str) -> int:
    use = reg.land_uses.get(use_id)
    if not use:
        print(f"unknown land use '{use_id}'. known: {', '.join(reg.land_uses)}")
        return 1
    print(f"{use.get('label', use_id)} — dependency profile\n")
    print("Requires:")
    for layer, spec in (use.get("requires") or {}).items():
        print(f"  {layer:14s} {spec}")
    induces = use.get("induces") or {}
    if induces:
        print("\nInduces (second-order public-service demand):")
        for layer, spec in induces.items():
            print(f"  {layer:14s} {spec}")
    if use.get("notes"):
        print(f"\nNotes: {use['notes'].strip()}")
    return 0


def cmd_standoffs(reg: Registry) -> int:
    standoffs = find_standoffs(reg)
    if not standoffs:
        print("No chicken-and-egg standoffs in the current model.")
        return 0
    print(f"{len(standoffs)} structural standoff(s) in the model "
          f"(cycles of mutually-blocking absent uses):\n")
    for s in standoffs:
        print(s.describe(reg))
        print()
    print("Once M1 connectors land, pass the uses already present in a place to\n"
          "filter these down to the standoffs that are actually stuck there.")
    return 0


_LEAN_MARK = {"favorable": "＋ favorable", "mixed": "～ mixed   ", "opposed": "－ opposed "}


def cmd_perspectives(reg: Registry, use_id: str) -> int:
    if use_id not in reg.land_uses:
        print(f"unknown land use '{use_id}'. known: {', '.join(reg.land_uses)}")
        return 1
    label = reg.land_uses[use_id].get("label", use_id)
    print(f'"Should we develop {label}?" — by stakeholder\n')
    for v in evaluate(reg, use_id):
        print(f"  {_LEAN_MARK.get(v.leaning, v.leaning)}  {v.label} — {v.question}")
        for r in v.reasons:
            print(f"        · {r}")
    verdict = ("CONTESTED: stakeholders disagree — a real values trade-off."
               if contested(reg, use_id)
               else "Stakeholders broadly aligned in the model.")
    print(f"\n  {verdict}")
    return 0


def cmd_validate(reg: Registry) -> int:
    print(f"OK: {len(reg.sources)} sources, {len(reg.layers)} layers, "
          f"{len(reg.land_uses)} land uses validated.")
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    cmd = argv[0] if argv else "report"
    try:
        reg = load_registry()  # validation runs here
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 2

    if cmd == "report":
        return cmd_report(reg)
    if cmd == "layer" and len(argv) > 1:
        return cmd_layer(reg, argv[1])
    if cmd == "todo":
        return cmd_todo(reg)
    if cmd == "use" and len(argv) > 1:
        return cmd_use(reg, argv[1])
    if cmd == "standoffs":
        return cmd_standoffs(reg)
    if cmd == "perspectives" and len(argv) > 1:
        return cmd_perspectives(reg, argv[1])
    if cmd == "validate":
        return cmd_validate(reg)

    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
