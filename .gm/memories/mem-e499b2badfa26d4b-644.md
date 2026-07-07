---
key: mem-e499b2badfa26d4b-644
ns: default
created: 1783448819626
updated: 1783448819626
---

## Resolved mutable: acptoapi-not-actually-running

Fixed test.js:81 to gate the REAL_OK live-LLM check on process.env.ANTHROPIC_API_KEY directly instead of the generic isReachable() probe (which pings acptoapi's default chain resolution, a different code path than the literal model:'claude/haiku' the assertion actually calls). Also fixed cli-verbs-smoke by restoring active project to 'default' via freddie project use default -- the failure was this session's own freddie project use fredtest call leaving the global ~/.freddie/projects.json registry pointed at fredtest, not a code regression. node test.js now reports 17 passed, 0 failed.
