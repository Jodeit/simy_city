# Contributing — a community garden you can also automate

`simy_city` is meant to grow two ways at once: **people** tending it like a
community garden, and **spare-token agents** doing well-scoped chores while we
sleep. Both work the same queue and pass through the same review gate.

## What a contribution looks like

The project is deliberately made of **small, independent, reviewable units**:

| Unit of work | Where | Why it's a good chunk |
|---|---|---|
| Add / refine a **data source** | `data_sources/registry.yaml` | one YAML entry, validated by tests |
| Tune a **dependency threshold** (with a citation) | `data_sources/layers.yaml` | one number + a source link |
| Build a **connector** for a source | `simy_city/connectors/<id>.py` | one module, one interface, testable in isolation |
| Improve a **research note** | `docs/data-sources.md` | prose, easy to review |

Because each unit is bounded and guarded by `tests/`, a contributor (human or
agent) can finish one in a single sitting without understanding the whole system.

## The contribution loop

1. **Pick a task.** `simy todo` lists sources still needing a connector.
   Threshold/research tasks live as GitHub issues labeled `good-first-task` and
   `agent-ready`.
2. **Make the change** on a branch.
3. **Prove it.** `pytest` must pass; new connectors ship with a small test using
   a cached/fixture response (no live network in CI).
4. **Open a PR.** CI runs registry validation + tests. A human reviews and merges.

## Spare-token automation (the "while we sleep" part)

The idea: contributors point **underutilized Claude Code capacity** at a queue of
pre-scoped tasks so the project advances autonomously, safely.

### How it's meant to work
- **Task spec.** Each `agent-ready` task is a self-contained brief: the goal,
  the files to touch, the interface to implement, the acceptance test, and links
  to the provider's API docs. (Template below.) A task is only `agent-ready` once
  it's this concrete — that's a human's job to prepare.
- **Runner.** A contributor runs an agent (e.g. `claude` in this repo) against a
  task. The agent works *only* within the task's stated files, runs the tests,
  and opens a PR. It never merges.
- **Guardrails.**
  - Agents **propose**, humans **merge** — every change lands via reviewed PR.
  - **No secrets in the repo.** API keys come from each contributor's own
    environment; the registry only records *that* a key is needed, never a value.
  - Scope is fenced to the task's files; schema tests + `simy validate` are the
    automatic backstop against malformed contributions.
  - Respect dataset licenses (OSM ODbL = attribution + share-alike) and provider
    rate limits — connectors must cache, not hammer.

### `agent-ready` task template
```markdown
## Task: Build connector for <source_id>
Goal: implement simy_city/connectors/<source_id>.py per the Connector interface.

Files you may change:
- simy_city/connectors/<source_id>.py   (new)
- tests/connectors/test_<source_id>.py   (new)

Interface: see docs/architecture.md → Connectors.
Source docs: <docs_url from registry.yaml>
Auth: <auth field>  (read key from env var, never hardcode)

Acceptance:
- `fetch()` returns a GeoDataFrame for a given geometry.
- `measure()` returns the layer's capacity_unit value.
- test uses a cached fixture response; no live network in CI.
- `pytest` and `simy validate` pass.

Out of scope: the dependency engine, scoring, frontend.
```

This task format is the contract between humans and agents. Keep tasks at this
altitude and the "semi-automated community garden" runs itself: humans decide
*what* and *whether*; agents do a lot of the *how*.

## Ground rules

- **Cite thresholds.** A dependency number without a source is a TODO, not a fact.
- **Free data only.** If a source isn't publicly accessible, it doesn't go in the
  registry.
- **Keep the core light.** Heavy geo deps stay in the `geo` extra so the registry
  tooling (and agents) run anywhere.
- **Be honest in reviews.** The model's value is that it's explainable; don't
  merge magic numbers or unverified sources.

## Local setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
simy report
```
