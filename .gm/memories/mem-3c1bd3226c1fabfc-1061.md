---
key: mem-3c1bd3226c1fabfc-1061
ns: default
created: 1783455318831
updated: 1783455318831
---

## Resolved mutable: aggregator-top-models-hollow

Root cause found: kimi-k2.6/glm-5.2 come from ~/.acptoapi/extra-providers.txt, a personal machine-local config (baseURL https://api.6345ywz.cn/v1 + apiKey) entirely separate from freddie/.env or any PROVIDER_KEYS entry -- pre-existing config on this machine, not something freddie ships or manages. Direct fetch to https://api.6345ywz.cn/v1/chat/completions with that exact key returns 401 {error:{message:'Invalid token'}} -- the key is expired/invalid. acptoapi's chain swallows this 401 into a hollow {content:null, usage:0/0/0} success shape instead of surfacing/erroring (a real acptoapi bug, same class as the earlier model-probe-live.js bug fixed this session -- out of scope to fix in the acptoapi repo again this turn). Conclusion: kimi-k2.6/glm-5.2's high swe_bench_score is NOT reachable through any currently-valid freddie/.env key -- they were never real candidates for model_preference; the swebench table includes models regardless of whether the operator's key for that provider actually works.
