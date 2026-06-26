# Who it's for — and your on-ramp

SIMyCity only works if very different people each get something *today* and a
reason to come back. Here's the value and the contribution path for each.

The pattern is the same every time: **use it for free → notice a gap → close the
gap → everyone's answers (including yours) get better.** That's the flywheel.

---

## 🚗 The Dreamer
*"There's an empty lot I drive past every day and wonder…"*

- **Today:** open the [explorer](../web/explore.html), click the lot, drop your dream
  (a café, homes, a park) and get a verdict in seconds — plus *why*.
- **Come back for:** saving and sharing scenarios (every analysis is a permalink),
  and watching how a place changes as data updates.
- **Your on-ramp:** suggest a new land use to model (e.g. "dog park", "brewery").
  It's a few lines in `data_sources/layers.yaml`.

## 🏠 The Property Owner
*"What is my land actually good for?"*

- **Today:** test uses against real demand, infrastructure, and hazards before you
  pay anyone for a feasibility study.
- **Come back for:** re-checking as rooftops, roads, and demand shift around you.
- **Your on-ramp:** tell us where the model was wrong about *your* parcel — that
  feedback sharpens the thresholds for everyone.

## 🏗️ The Real-Estate Developer
*"I already know this. Let me tie in my own data."*

- **Today:** use **Bring your own data** in the explorer to overlay private comps
  and tracked sites. It stays in your browser (local storage) — never uploaded.
- **Come back for:** your private layer sitting on top of a public model that keeps
  improving for free.
- **Your on-ramp:** a great proposed feature is richer private overlays (CSV
  upload, pro-forma inputs). The client-side, privacy-first pattern is already set.

## 📊 The Analyst / Development Officer
*"I'm always adding new data points to my model."*

- **Today:** the whole model is open YAML (`registry.yaml`, `layers.yaml`). Read it,
  fork it, point the CLI at it.
- **Come back for:** the **compounding** — every dataset, threshold, or land use you
  add makes the model (and your own analyses) sharper.
- **Your on-ramp:** add a source to `registry.yaml` or a threshold to `layers.yaml`.
  Run `python tools/build_model_json.py` and the live explorer reflects it. See
  [contributing](contributing.md).

## 💻 The Developer
*"This needs some serious love. Honestly it should be on Next.js."*

You might be right — and that's an invitation, not a defense.

- **Where it stands today:** deliberately boring and low-friction — static HTML +
  vendored Leaflet for the explorer, Python for the model/CLI, plain YAML as the
  source of truth, zero build step. That was the fastest path to *something
  clickable on day one*, and it keeps the contributor bar low (edit a file, see it
  change).
- **Should it be Next.js?** Quite possibly, as the UI grows — parcel search, saved
  scenarios with accounts, server-side isochrones, an API. The honest trade-off:
  a framework buys real app features but raises the floor for casual contributors.
  A likely answer is a **hybrid**: keep the YAML model + Python engine as the core,
  and let a Next.js front-end consume a generated API (`model.json` is already the
  seam). **If you want to lead that, open an issue titled *"Frontend architecture:
  Next.js?"* and propose the migration path.** Founding-architect energy is welcome.
- **Come back for:** it's early enough that your decisions stick.
- **Your on-ramp:** the connectors (`simy todo`) are clean, isolated units — pick
  one. Or take the framework question above.

## 📣 The Community Advocate
*"I need to make the case at the next council meeting."*

- **Today:** run the scenario, read the stakeholder breakdown (who's favorable,
  who's opposed, *why*), see the standoff and its cheapest break, then hit
  **📣 Make the case** to copy a council-ready summary or email it.
- **Come back for:** monitoring your neighborhood and turning every new proposal
  into evidence — for *or* against.
- **Your on-ramp:** the stakeholder weights and impact severities are editable in
  `layers.yaml`. If you think the model under-weights, say, habitat or traffic,
  propose a change **with a citation** — that's how the model stays honest rather
  than capturing one side.

---

## The through-line

Consumer value and contribution aren't separate tracks. The explorer is useful on
its own, but every persona's natural next instinct — "it should also know about
*X*" — is a one-file pull request. That's the garden: lots of small, self-interested
contributions adding up to a public good. See [contributing](contributing.md) and
[the spare-token automation model](contributing.md#spare-token-automation-the-while-we-sleep-part).
