# Agent Note: lexicon trigger cache (reverted)

Status: reverted in 3d0f8a12 (the revert commit for c7d6d062)

## Outcome

The input lexicon cache and its disposed getter did not reduce per-token cost. `getSnapshot` measured 0.084 ms per token both before and after, and the lookups it targeted were not called during the streaming bench. The code was removed; the lookup through `inputTriggers` is the original code again.
