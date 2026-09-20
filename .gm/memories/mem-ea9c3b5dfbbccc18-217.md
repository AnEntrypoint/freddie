---
key: mem-ea9c3b5dfbbccc18-217
ns: default
created: 1789796755784
updated: 1789796755784
---

## Resolved mutable: gm-progress-append-ownership

packages/gm/tool-gm/src/index.js:80-90 try/catch around session.append swallows errors (void error). exec_js 1789796744481 foldGmGraph never threw on empty previous.
