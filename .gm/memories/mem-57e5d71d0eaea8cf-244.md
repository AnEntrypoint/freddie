---
key: mem-57e5d71d0eaea8cf-244
ns: default
created: 1789391140066
updated: 1789391140066
---

## Resolved mutable: trajectory-virtualizer-callback-scheduling

invariant: Virtualizer onChange now calls #scheduleVirtualRender(), which uses one microtask and an isConnected guard; measure cannot recursively enter #render on the same stack.
