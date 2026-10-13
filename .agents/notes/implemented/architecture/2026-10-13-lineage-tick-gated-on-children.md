# Agent Note: Lineage running-duration tick renders only when the catalog has children

Status: implemented

## Problem

`FreddieCatalogDropdown` runs a 1000 ms interval while its menu is open and a descendant is running. Each tick re-rendered the trigger and the menu even when the catalog had no child rows to show (loading, or an empty or failed load). Those renders wrote only unchanged `ref` attributes, two per tick on the trigger button and root div, and changed no visible text.

The lineage element was also unreachable on `?fixture`. No module imports `ui-subagent/src/client/SubagentHeaderLineage.js`, so `freddie-subagent-header-lineage` is never defined and the slot entry host never calls `setProps`. The element is equally unreachable outside the fixture.

## Decision

- The interval callback renders only when the open catalog has at least one `kind: 'child'` entry. Durations exist only on child rows, so a childless tick has nothing to show.
- `#render` refreshes `#now` itself. Renders triggered by the store, the catalog arriving, or placement then carry a current clock, not the last tick's.
- `?fixtureLineage=running` (test-only, in `fixture.js`) adds a running subagent child of `fx-alpha`, returns it from `subagents.list`, and projects its `subagentTiming`. `?fixtureLineage=pending` adds the child without catalog entries, to hold the loading state. `ui-subagent/src/client/index.js` dynamically imports the element module when the `fixtureLineage` query is present, so the element is defined only on that path.

## Measurements (10 s idle, dropdown open, headless Chrome, fixture)

| State | Lineage interval callbacks | Lineage DOM records | Unchanged-value writes | Callback time |
| --- | --- | --- | --- | --- |
| pending, before | 10 | 20 | 20 (ref on button and div) | 3.0 ms |
| pending, after | 10 | 0 | 0 | not split out |
| running, before | 10 | 50 | 20 ref writes; the rest are the duration text, title and aria-label changing each second | 4.2 ms |
| running, after | 10 | 44 | same as before | 3.6 ms |

The visible duration still ticks (`1m 10s` to `1m 20s` over 10 s in the running state).

## Consequences

The tick is not a hitch source. It costs well under 1 ms per tick. The gate removes the childless renders; it does not change the child-row case, where the duration must update each second.

Not fixed: webjsx writes the `ref` attribute on every render even when the function source is unchanged. That is a renderer issue in `@freddie/webjsx`, not this tick.

Not fixed and not a test-only concern: the lineage element is never registered in the shipped client. Registering it means importing `SubagentHeaderLineage.js` from `ui-subagent/src/client/index.js`, which would change production visible behaviour. That is a product decision, so the import stays gated behind the fixture flag.

## Alternatives considered

- Stop the interval when the catalog is childless. Rejected: the catalog can arrive while the menu is open, so the interval would need re-syncing from the store. A cheap no-op check each second is simpler.
- Compare formatted durations before rendering. Rejected: the children rows still need every tick, so the comparison would add work without removing any render.
