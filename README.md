# simy_city

**A SimCity for the real world — built on public data.**

Pick a real parcel of land. Ask what would happen if you developed it for a
purpose. `simy_city` pulls together free, public data to answer two linked
questions:

1. **Why is the world the way it is here?** — e.g. *why hasn't Costco or
   Chipotle opened a location closer to me?*
2. **What would happen if I changed it?** — *if I bought this plot and built a
   data center (or homes, or a store), would it succeed or fail, and what would
   it pull on?*

The twist that makes it more than a dashboard is **dependencies**, modeled like
the systems in SimCity. A data center doesn't just need land — it needs
**power, water, and broadband**. Are those available nearby? At what capacity?
And if you build it, what *second-order* demand does it induce — does the
population it brings now require **schools, hospitals, fire stations**? At what
scale? To what degree? `simy_city` walks that graph.

> **Status:** early. This milestone delivers the **public-data source registry +
> research doc** — the catalog of free datasets everything else is built on,
> plus a working dependency model and a tiny CLI to explore it. See
> [`docs/`](docs/) and [`data_sources/`](data_sources/).

---

## The testbed: ZIP 78738 (Bee Cave / Lake Travis, TX)

We anchor the work on a concrete place: **78738**, the affluent but
low-density Hill Country west of Austin. It's a great stress test:

- **Retail:** It's *not* poor — so the absence of a warehouse club isn't about
  income. It's about **rooftops within a drive-time ring** and a road network
  cut up by the lake. That's exactly the kind of thing a model can surface.
- **Infrastructure:** It sits on the **ERCOT** grid, in drought-prone, flash-flood
  Hill Country with steep terrain — so the data-center dependency story (power +
  water + fiber + flood/slope constraints) is real and local.

Everything generalizes to any US address; we just prove it somewhere specific
first.

---

## How it works (the model)

Two YAML files in [`data_sources/`](data_sources/) are the heart of the system:

- **[`registry.yaml`](data_sources/registry.yaml)** — every public dataset we
  use: who publishes it, how to reach it (API / download / GIS service), auth,
  key fields, license, and **why it matters for 78738**.
- **[`layers.yaml`](data_sources/layers.yaml)** — the SimCity-style *service
  layers* (power, water, broadband, education, health, safety, demand, …) and
  the *land uses* you can "drop" on a parcel, each with its dependency edges:
  - `requires` — hard inputs (a data center *requires* ≥20 MW power, ≥1 MGD
    water, redundant fiber, ≥10 buildable acres).
  - `induces` — second-order public-service demand it creates at a given scale
    (1,000 new homes *induce* school demand; 5,000 *induce* a new fire station).

A small Python package ([`simy_city/`](simy_city/)) loads, **validates**, and
queries this model. Try it:

```bash
pip install -e .
simy report               # source count per service layer (find thin spots)
simy layer power          # which datasets feed the power layer
simy use data_center      # full dependency profile of a data center
simy todo                 # connectors a contributor could build next
```

## What's in the box now

| Piece | File | What it does |
|---|---|---|
| Data-source registry | `data_sources/registry.yaml` | 23 free public datasets, fully annotated |
| Service-layer + dependency model | `data_sources/layers.yaml` | layers, land uses, requires/induces edges |
| Loader / validator / query API | `simy_city/registry.py` | typed objects, schema validation |
| CLI explorer | `simy_city/cli.py` | `simy report / layer / use / todo / validate` |
| Tests | `tests/test_registry.py` | CI guards the registry schema |
| Research doc | `docs/data-sources.md` | the public-data landscape, narrated |
| Architecture | `docs/architecture.md` | how the analysis pipeline will work |
| Roadmap | `docs/roadmap.md` | milestones from registry → MVP → sim |
| Collaboration model | `docs/contributing.md` | community garden + spare-token agents |

## The collaboration idea

Two things make this a *community* project, not just a tool:

1. **Open like a community garden.** Anyone can add a data source, refine a
   dependency threshold (with a citation), or build a connector. The registry is
   plain YAML precisely so contributions are low-friction and reviewable.
2. **Semi-automated with spare Claude Code tokens.** Contributors can point
   *underutilized* agent capacity at a queue of well-scoped tasks (e.g. "build
   the connector for `fcc_bdc`") so the project advances while we sleep. The
   design for that — task format, guardrails, review gates — is in
   [`docs/contributing.md`](docs/contributing.md).

See **[`docs/roadmap.md`](docs/roadmap.md)** for where this goes next.

## License

Code: MIT. Each dataset carries its own license — see the `license` field on
every entry in `registry.yaml` (notably OpenStreetMap is ODbL: attribution +
share-alike).
