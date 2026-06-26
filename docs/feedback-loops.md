# Feedback loops & chicken-and-egg standoffs

The first cut of the model is one-directional: drop a use on a parcel → check
what it `requires` → expand what it `induces`. But the most interesting real-world
answers are *circular*, and a one-directional model misses them.

## Why "households" isn't the end of the story

If household count is a primary driver of commercial investment, the obvious next
question is: **why aren't housing developers building the households?** A parcel
can be perfectly buildable — zoned, with water, power, and road access — and still
sit empty for years because the **demand to build** isn't there. Developers invest
when homes will *absorb* quickly, which depends on:

- **jobs** nearby (people need a reason to live here),
- **amenities** — retail, schools, services already present,
- **price headroom** — achievable sale price above land + infra + construction.

So we model housing with two distinct gates (see `residential_subdivision` in
`layers.yaml`):

- `requires` — supply-side feasibility (*can* it be built?),
- `demand_signals` — investment trigger (*will a developer choose to* build it?).

## The standoff

Now the loop closes. Retail (`warehouse_club`, `fast_casual`) is enabled by
**rooftops**. Housing is enabled by **amenities** — and retail is an amenity. Each
party is individually rational to wait:

```
   residential_subdivision ──(provides rooftops)──▶ warehouse_club
            ▲                                            │
            └────────(retail is an amenity)──────────────┘
```

Both projects might be viable *once the other exists*, but neither moves first.
That standoff — not income, not raw geography — is often the real reason "nothing
is here." 78738's affluence makes this especially clear: the money is present; the
**coordination** is missing.

## How SIMyCity surfaces it

`enabling_edges` in `layers.yaml` declares these "X makes Y viable" relationships,
each tagged with a `breaker_cost`. The detector (`simy_city/standoffs.py`,
`simy standoffs`) finds every cycle of **absent** uses and reports:

- the loop (who's waiting on whom), and
- the **cheapest edge to break it** — where a public actor (or an anchor tenant,
  or an incentive) could supply the missing signal directly and unstick everything.

```text
STANDOFF: Residential Subdivision → Fast-Casual → Residential Subdivision
  each waits on the next; none moves first.
  cheapest break: supply "amenity raises home absorption" (fast_casual → residential, cost=low).
```

That last line is the actionable output: of the standoffs gripping a place, the
fast-casual amenity is the cheapest lever to pull, while seeding an *employment
center* is the expensive one. This is exactly the kind of intervention analysis a
city, a developer, or a community group would want.

## From structural to actual

With `present=None`, the detector shows every standoff the model *can* contain —
useful for understanding dynamics. Once the M1 connectors land, we pass the uses
that **already exist** in a place (from OSM/parcel data); edges through present
uses drop out, leaving only the standoffs that are *actually* stuck on the ground
at that location. That turns a structural diagram into a local diagnosis.

## This is the SimCity loop — and the SIMyCity point

In SimCity, zoning residential makes commercial viable, which makes more
residential desirable; pull one lever and the whole system re-settles. SIMyCity
models the same feedback with real data — and because standoffs are fundamentally
**coordination** problems, they're also where a *community* (the "my/our city"
half of the name) can act together where no single private actor will move alone.
