---
key: mem-bd8abfcf0e2c33ae-272
ns: default
created: 1789643915107
updated: 1789643915107
---

## Resolved mutable: dream-rsi-policy-discovery-binding

dream_rsi.rs:212-214 loads and verifies signed same-session policy records before record_discovery accepts policy_id; unknown or cross-session policy IDs reject. wasm cargo check passed at gm_exec_js 1789643864014.
