# AGENTS.md — llm-retry

## Rationale

- `src/index.js` `always` policy: the loop and plugin lifetime stay open until delegated recovery settles, and the abort check after `settleDownstream` runs before the decision or fallback can mutate later state.
- `src/index.js` recovery callback: a waterfall may have captured the callback before its registration was removed, so `lifetime.signal.aborted` short-circuits it and a stale callback never enters a downstream policy after disposal.
