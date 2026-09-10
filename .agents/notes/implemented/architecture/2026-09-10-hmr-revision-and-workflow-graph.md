# HMR revision handoff, atomic gm spool, and workflow graphs

Rebuild frames now carry the current client-module graph row and graph revision. The browser half calls `updateGraphRow` before `invalidate`/`prefetch`, so native `import()` fetches the cache-keyed URL instead of the boot-time module. A reconnect `graph` frame whose revision differs from the live manifest remounts the shell under `/__hmr/<rev>/` without `location.reload`. Custom-element rows still force a full page reload; the node half classifies a tree once, then reclassifies only when that watch snapshot actually changes.

Host HMR never calls `loader.exit()`. A change in the CLI entry's `externals` stashes and takes the same cache-bust + plugin-reload path as application modules. `hmr/before-reload` can defer while a turn is inflight; `snapshot()` returns leaf-only `{deferred, stashed, events}`. Import failure restores the previous ESM/CJS caches; apply failure restores the previous fiber.

gm spool publishes each request with a same-directory rename and delays health walks until several missed 25ms ready-file polls. `resolveProjectCwd` prefers `session.header.cwd` over the GUI host `process.cwd()`, and `ensureDaemon` waits on a live machine-wide heartbeat before spawning another runner.

`ctx.workflowEngine.graphs` records leaf-only run graphs from `workflow/*` events so parallel dynamic workflows have native tracking without dumping live Cordis objects. Node ids prefer the worker's `childId`/`seq`; settlement maps `outcome` (`completed`/`failed`/`cancelled`) so a failed child is not left `running`.

A later bundle patch replaces a row's whole `config`. `packages/bundle/web-app/cordis.patch.yml` and `packages/bundle/headless/cordis.patch.yml` therefore restate `system-prompt.toolOrder` beside the persona they own. The web overlay still disables host-plane `tool-workflow`/`tool-ralph`; the `standard` preset mounts them per session.
