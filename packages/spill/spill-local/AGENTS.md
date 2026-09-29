## Rationale

- `src/store.js` path encoder deliberately mirrors the JSONL path encoder but keeps spill's empty-name policy (`""` becomes `"~"`) local so storage backends stay decoupled.
