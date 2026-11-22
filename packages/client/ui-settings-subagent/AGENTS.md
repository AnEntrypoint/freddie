# client-ui-settings-subagent

## Rationale

- Node half registers the `subagent` settings namespace (not imported from the client half, which must not depend on the Host half); the browser card registers into `settings.plugin.item` keyed by that exact string, and the Plugins page dispatches it only while the namespace is served. The card renders nothing while unavailable.
- Limits: `maxDepth` min 0 (zero forbids delegation; a tool's tighter maximum still wins), `maxActiveSubagents` min 1 default 5 (smallest fan-out without siblings serialising behind one slot); no upper bounds, the safe-integer range is the delegation stack's limit. Nothing reads the section yet (see README deferred work).
- `SubagentCard`: disclosure is card-local state; `numeric` only hints the keypad, the field spec decides what is accepted.
