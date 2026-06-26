"""A tiny CLI to explore the registry — the first usable surface of simy_city.

    python -m simy_city.cli report          # source count per service layer
    python -m simy_city.cli layer power      # sources feeding the power layer
    python -m simy_city.cli todo            # connectors a contributor can pick up
    python -m simy_city.cli use data_center  # dependency profile of a land use
    python -m simy_city.cli validate        # exit non-zero if registry is broken
"""

from __future__ import annotations

import sys

from .registry import Registry, load_registry


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
    if cmd == "validate":
        return cmd_validate(reg)

    print(__doc__)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
