---
key: mem-24e3aeafe4eb3b97-193
ns: default
created: 1788785890120
updated: 1788785890120
---

## Resolved mutable: hooks-are-code-execution

packages/gm/gm-config/src/graph.js resolveHookPath returns {path,exists}. No Function/eval/vm of hook bodies. README: never evaluates hooks/*.js.
