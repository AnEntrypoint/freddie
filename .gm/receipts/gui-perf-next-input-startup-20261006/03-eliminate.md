# 03-eliminate: gui-perf-next-input-startup-20261006
session: mcp-codemode-3535970-1793542718115-1-16

## U3 browser and lease (known)
expected (from row contract "real-keyboard" and "fresh owned browser"): a Chromium binary that runs with real key injection, no GPU lease held.
observed: Chromium 155.0.8059.39 at /data/cache/bin/chromium (dispatch 1793543340088-504-3b8178681715e067); global WebSocket on node v24.22.0; no playwright/puppeteer in repo; /data/cache/ms-playwright present; gpulock dir absent (dispatch 1793543334333-488-90e898b5a3ca5390).
note: a foreign Chromium (pid 3476884, profile /config/.config/chromium, GPU process active) is running. Not ours; not touched. Our measurement must use its own --user-data-dir.
resolved: gui-perf-next-input-startup-20261006-u3 (mutable-resolve dispatch 1793543422611-691-babc0740b15188b5).

## environment blocker found (new unknown U7)
- /workspace/freddie has no node_modules (checked dispatch 1793543373138-582-9f8b3974e3b36434). The web entry cannot boot without `pnpm install`.
- `pnpm install --frozen-lockfile --prefer-offline` started (dispatch 1793543413479-667-4b4103614f8c4bbe, background). Pending.

## U5 browser boot entry (located, static)
- apps/web/index.html -> script module /src/main.js (7 lines) -> `AppWebEntry` from `@freddie/freddie-client-web` -> `entry.run()`.
- packages/bundle/web-app/src/index.js: server-side web-runtime plugin; serves `@freddie/freddie-web-frontend/index.html` via FrontendStatic; prints URL; opens browser unless --no-open.
- packages/bundle/web-app/cordis.patch.yml: boot plugin list (client-modules, client-runtime, cordis-client-runner, ui-conversation, ui-layout, ...).
- status: located; activation order still needs a live boot to witness (U4).

## U1, U2, U4, U6
open. U1/U4 need a live browser run against a booted web server (after U7). U2 needs the same run plus the measured hot function. U6 needs a session with draft, caret and scroll to assert before and after.
