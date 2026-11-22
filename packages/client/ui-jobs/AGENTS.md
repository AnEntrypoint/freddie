# AGENTS.md — ui-jobs

## CSS rationale

- `JobListAction.css`: a failed job's detail is the producer's raw error text with no bound, so without the ellipsis rule it widens the row past the menu.

## Contracts

- The header action renders nothing until the session has a job, and issues no RPC. Status `stopping` and `killed` share the attention color (work ended or is ending on request). Rows sort live jobs first in start order, then settled jobs newest-first with start order as tie-break, so the sort never depends on host map iteration. Durations top out at hours because no producer reaches longer.
