# "Should we develop?" — competing priorities

Feasibility and market success answer *can* it be built and *will* it pay. They
don't answer **should** it be built. That question has no single answer — it has
**competing** answers, because different people value different things about the
same parcel. SIMyCity models that disagreement instead of hiding it behind one
score.

## The stakeholders (v0)

Defined in `layers.yaml` → `stakeholders`, scored by
`simy_city/perspectives.py`:

| Stakeholder | Asks | Weighs |
|---|---|---|
| **Developer** | Will this make money? | demand, absorption, cost (pro-build by default) |
| **Existing resident** | Better daily life without ruining the area? | amenities & services vs. traffic and sprawl |
| **Environmentalist** | What does this destroy or emit? | habitat loss, impervious cover, carbon, water stress |
| **Municipality / taxpayer** | Does the tax base cover the services it triggers? | tax base vs. induced schools / fire / roads |

The environmentalist is a first-class voice here, not an afterthought: each land
use carries an `impacts` profile (`habitat`, `land_cover`, `carbon`,
`water_stress`, `traffic`), and the ecology data sources in the registry
(USFWS critical habitat, PAD-US protected areas, NLCD impervious/canopy, GBIF
biodiversity, and locally the TCEQ Edwards Aquifer zones) are what will quantify
those severities at a real parcel.

## What it produces

```text
$ simy perspectives data_center
"Should we develop Data Center?" — by stakeholder
  ＋ favorable  Developer
  － opposed   Existing Resident      (land_cover impact = high)
  － opposed   Environmentalist       (carbon = high, water_stress = high, ...)
  ～ mixed     Municipality           (tax base vs. 2 induced services)
  CONTESTED: stakeholders disagree — a real values trade-off.
```

Contrast that with `simy perspectives fast_casual`, which comes back **broadly
aligned** — a Chipotle is low-impact and adds an amenity, so there's no real
values fight. And `simy perspectives residential_subdivision` is **contested**:
greenfield sprawl is exactly where residents-who-want-amenities, environmentalists
-who-want-habitat, and developers-who-want-rooftops collide.

The key output isn't the per-stakeholder verdict — it's the word **CONTESTED**.
That flag says "this is a values trade-off, not a technical question," which is
precisely where a tool should *inform* a decision rather than pretend to make it.

## How this connects to the rest of the model

- **Feasibility** (`requires`) and **market** (`demand_signals`) say whether a use
  *can* and *will* happen.
- **Standoffs** (`enabling_edges`) explain why nothing happens even when it could.
- **Stakeholders** (`impacts` + perspectives) say whether it *should* — and for
  whom it's worth it.

A development can be feasible, profitable, *and* a net loss for the environment and
existing residents. SIMyCity's job is to put those facts side by side. Carbon and
habitat are competing priorities to weigh, not boxes to check — so the model
surfaces the tension and leaves the value judgment to people (the "my/our city"
half of the name).

## Honest limits (v0)

- Impact severities are currently **qualitative** (low/medium/high) authored in
  the model. M2 replaces them with values measured from the ecology data sources
  at a specific parcel (e.g. "intersects golden-cheeked warbler critical habitat",
  "+38% impervious over the recharge zone").
- The stakeholder weights and leaning thresholds are **coarse and tunable** — a
  prime target for community refinement, each ideally backed by a citation
  (a planning standard, a carbon factor, a habitat designation).
- Real stakeholders are more than four. The model is structured so adding voices
  (e.g. nearby business owners, school district, downstream water users) is just
  another `stakeholders` entry.
