---
key: mem-fae868cbb4cc867f-282
ns: default
created: 1790938243485
updated: 1790938243485
---

## Resolved mutable: res-grace-bounded

degradation: Menu.js #armGrace and HoverCard.js #armClose both clearTimeout the previous timer, then set one 200ms timer. Live page: enter within 40ms of leave cancelled the close; a leave with no re-enter closed at 320ms. No unbounded wait.
