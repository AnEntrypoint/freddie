# HMR revision handoff, atomic gm spool, and workflow graphs

Rebuild frames now carry the current client-module graph row and graph revision. The browser half calls `updateGraphRow` before `invalidate`/`prefetch`, so native `import()` fetches the cache-keyed URL instead of the boot-time module. A reconnect `graph` frame whose revision differs from the live manifest remounts the shell under `/__hmr/<rev>/` without `location.reload`. Custom-element rows still force a full page reload; the node half reclassifies that on every poll.

gm spool publishes each request with a same-directory rename and delays health walks until several missed 25ms ready-file polls. `resolveProjectCwd` prefers `session.header.cwd` over the GUI host `process.cwd()`, and `ensureDaemon` waits on a live machine-wide heartbeat before spawning another runner.

`ctx.workflowEngine.graphs` records leaf-only run graphs from `workflow/*` events so parallel dynamic workflows have native tracking without dumping live Cordis objects. Node ids prefer the worker's `childId`/`seq`; settlement maps `outcome` (`completed`/`failed`/`cancelled`) so a failed child is not left `running`.
