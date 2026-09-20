---
key: mem-cca74fe2e3abdb8c-275
ns: default
created: 1789892157598
updated: 1789892157598
---

## Resolved mutable: unknown-model-predicate

precondition: auto-chain.js:739 skips only when targetModel is truthy and !== 'auto'. handleChat unknown path server.js:877 calls buildAutoChainLive(undefined) which still awaits refreshAll. Named queue 850-851 never calls Live.
