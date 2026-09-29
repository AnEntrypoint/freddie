## Rationale

- `src/index.js` `send_message` / `interrupt_agent`: authority requires an exact live calling agent (parent for send, ancestor for interrupt); the service authorizes that caller against the target's recorded lineage and the tool adds no authority of its own.
- `src/list-agents.js`: one-shot children cannot be continued by `send_message`, so they are never listed for selection; discovery still traverses them for descendants. `String()` on `entry.parent`/`entry.depth` spans the schema-optional shape (only descendants rows carry them). The scan observes the call's signal because the registry drains started tool bodies and a slow catalog must not finish after cancellation. Non-agent callers have no session whose children could be listed.
