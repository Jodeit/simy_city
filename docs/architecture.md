# Architecture

How a parcel question becomes an answer. This describes the target pipeline; only
the **registry + model + loader** layers exist at v0.1.0 — the rest is the
roadmap.

```
                       ┌──────────────────────────────────────────┐
   address / parcel →  │ 1. RESOLVE   geocode → parcel geometry     │
                       │    nominatim, tcad_parcels                 │
                       └───────────────┬──────────────────────────┘
                                       ▼
                       ┌──────────────────────────────────────────┐
                       │ 2. TRADE AREA   drive-time isochrones      │
                       │    openrouteservice / OSRM                 │
                       └───────────────┬──────────────────────────┘
                                       ▼
                       ┌──────────────────────────────────────────┐
                       │ 3. GATHER   pull each service layer's      │
                       │    sources within the isochrone/buffer     │
                       │    (connectors, one per registry source)   │
                       └───────────────┬──────────────────────────┘
                                       ▼
                       ┌──────────────────────────────────────────┐
                       │ 4. MEASURE   reduce raw data → a capacity  │
                       │    number per layer (households, MW, MGD,  │
                       │    Gbps, enrollment headroom, …)           │
                       └───────────────┬──────────────────────────┘
                                       ▼
   land use (e.g.      ┌──────────────────────────────────────────┐
   data_center)    →   │ 5. EVALUATE   depgraph: compare required   │
                       │    vs available; compute induced demand    │
                       │    layers.yaml requires / induces edges    │
                       └───────────────┬──────────────────────────┘
                                       ▼
                       ┌──────────────────────────────────────────┐
                       │ 6. EXPLAIN   scorecard + reasons +         │
                       │    map layers  →  web frontend             │
                       └──────────────────────────────────────────┘
```

## Components

### Registry & model (`data_sources/*.yaml`) — **built**
The declarative core. `registry.yaml` = where data lives; `layers.yaml` = how
land uses depend on service layers. Plain YAML so non-coders and agents can
contribute. Validated by `simy_city/registry.py`.

### Loader / query API (`simy_city/registry.py`) — **built**
Typed access + schema validation + queries (`for_layer`, `needing_connector`,
`coverage_report`). Zero heavy deps so it runs in any contributor's agent.

### Connectors (`simy_city/connectors/`) — **next**
One module per registry source, all implementing a common interface:

```python
class Connector(Protocol):
    source_id: str
    def fetch(self, geom: Geometry, **params) -> GeoDataFrame: ...
    def measure(self, data: GeoDataFrame, layer: str) -> Capacity: ...
```

This uniform shape is what makes connectors **independently buildable** — the
perfect unit of work for the spare-token contributor queue. The registry's
`connector_status` field tracks progress; `simy todo` lists what's open.

### Dependency engine (`simy_city/depgraph.py`) — **designed**
Walks `requires`/`induces` from `layers.yaml`. For a (parcel, land_use) pair:
- **feasibility**: every `requires` layer's measured capacity ≥ threshold?
- **gaps**: which requirement fails and by how much (e.g. "needs 20 MW, nearest
  substation headroom ~8 MW → transmission upgrade required").
- **induced demand**: expand `induces` edges into new service needs at the given
  scale, then recurse (new homes → schools → ... ) to a bounded depth.

The output is a graph, which is both the explanation *and* the SimCity feedback
loop: dropping a use changes the layers, which changes what *else* becomes
viable nearby.

### Scoring (`simy_city/score.py`) — **designed**
Turns the graph into a succeed/fail scorecard with transparent, cited reasons.
Every threshold in `layers.yaml` should eventually carry a planning-standard
citation so scores are defensible, not magic numbers.

### Web frontend — **later**
Lightweight React + Leaflet/MapLibre map. Drop a use on a parcel, see the
isochrone, the capacity of each layer, and the pass/fail reasons. Read-only
public API over the engine first; interactive "what-if" after.

## Design principles

1. **Declarative first.** Knowledge (sources, thresholds, dependencies) lives in
   reviewable YAML, not code. Lowers the bar for contributions and lets agents
   propose data changes that humans can diff.
2. **Cache the public web.** Public APIs have rate limits; the gather layer
   caches aggressively to a local store so analyses are reproducible and cheap.
3. **Cite everything.** Each capacity threshold and dependency edge should point
   to a standard or a source. The goal is an *explainable* model, not a black box.
4. **Small, independent units of work.** Connectors and thresholds are sized so a
   single agent run can complete one with tests — see `docs/contributing.md`.
5. **Local-first, generalize later.** Prove each pattern on 78738 / Travis County,
   then lift it to a national connector.
