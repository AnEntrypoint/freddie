# client-ui-settings-subagent

## Rationale

- Node half registers the `subagent` settings namespace (not imported from the client half, which must not depend on the Host half); the browser card registers into `settings.plugin.item` keyed by that exact string, and the Plugins page dispatches it only while the namespace is served. The card renders nothing while unavailable.
- Limits: `maxDepth` min 0 (zero forbids delegation; a tool's tighter maximum still wins), `maxActiveSubagents` min 1 default 5 (smallest fan-out without siblings serialising behind one slot); no upper bounds, the safe-integer range is the delegation stack's limit. Nothing reads the section yet (see README deferred work).
- `card-form.js` duplicates the Plugins section's staged-form model on purpose: the bundle purity gate forbids value imports across plugins. A field shows its effective value; presence in the raw user layer marks it overridden; an unacceptable draft blocks the save instead of being dropped; after save the outcome is read back from the section (the Host decides acceptance) and failed drafts stay staged. Empty draft clears the field. Projections publish through a snapshot store because slot components read via snapshot selectors.
- `SubagentCard`: disclosure is card-local state; `numeric` only hints the keypad, the field spec decides what is accepted.
- `invariant.js`: no runtime invariant; write refusals are the settings service's contracts.
