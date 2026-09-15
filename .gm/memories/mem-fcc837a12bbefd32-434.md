---
key: mem-fcc837a12bbefd32-434
ns: default
created: 1789498361894
updated: 1789498361894
---

## Resolved mutable: question-lifecycle-owner

Live browser session rendered a host-originated pending question through the real model tool; source chain is tool-ask-user/src/index.js:79-97 -> apiproxy/src/api-proxy.js:1186-1212 -> runtime sessions/session.js:476-485 -> ui-user-questions QuestionComposer. The reconnect ordering risk is evidenced by session resync clearing pending at session.js:394-397 after mux frames may arrive.
