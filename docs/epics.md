# Epics

> **Binding doc** (see "Binding docs" in the root `CLAUDE.md`). The build order, and what "done" means for each
> epic. Empty in the starter. Order epics riskiest first: the epics most likely to prove `docs/domain-map.md` wrong
> come first, while correcting it is still cheap. Every epic is a vertical slice (schema, service and API, tools,
> web feature, tests) and ends demoable. Reordering, adding or closing an epic ships as an amendment in the same pull
> request.

Companions: [VISION.md](VISION.md) · [domain-map.md](domain-map.md) ·
[lifecycles-and-invariants.md](lifecycles-and-invariants.md) · [event-vocabulary.md](event-vocabulary.md) ·
[module-map.md](module-map.md) · [adr/](adr/README.md)

## How to write an epic

_How to fill this: copy the block below once per epic, numbered E1, E2, … in build order. E1 is the spine: the
entities everything else references. Keep each epic to what one person can demo in a sitting._

```markdown
## E<n> — <name>

- **Entities:** the models from `docs/domain-map.md` this epic creates or changes.
- **Events:** the events from `docs/event-vocabulary.md` it adds.
- **Modules:** the folders from `docs/module-map.md` it touches (two epics run in parallel only when these differ).
- **Demoable when:** the click-through that proves it works, as steps a person can follow.
- **Risk retired:** the assumption this epic tests, and the ADR it would amend if the assumption is wrong.
- **Status:** planned | in progress (#issue) | done (date, closing PR).
```

## Epics

_How to fill this: the epics, in order. When an epic closes, set its status and add a one-line follow-on note for
anything it taught that changed a binding doc._
