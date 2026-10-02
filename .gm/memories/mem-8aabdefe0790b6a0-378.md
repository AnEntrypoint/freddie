---
key: mem-8aabdefe0790b6a0-378
ns: default
created: 1790929693173
updated: 1790929693173
---

## Resolved mutable: openrouter-rank-cache-owned

exec_js 1790929675141: first refreshOpenrouterFreeRank returned a 13-id array; the second call 22ms later returned the same array (sameArray true). lib/auto-chain.js refreshOpenrouterFreeRank returns the cached ids inside TTL and shares one inFlight fetch. A failed fetch throws before the assignment, so the previous ids stay.
