---
key: mem-efac0b7ed0033e4c-226
ns: default
created: 1789844666211
updated: 1789844666211
---

## Resolved mutable: watch-closed-on-settle

packages/gm/gm-client/src/spool.js:264-292 waitForOutOrTimeout finish() is once (settled), clearTimeout(timer), watcher.close() when defined, abort and watch error both call finish.
