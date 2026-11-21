# fx cut table (stage 0, freddie half)

Written 2026-11-21 against fx's [host-interface.md](/workspace/fx/fx/docs/host-interface.md) (fx checkout /workspace/fx/fx) and this checkout. It answers the plan in `/workspace/hyperagent/docs/fx-freddie-txiki-plan.md`: freddie runs inside fx on the embedded txiki.js, what fx already does natively is cut, and what remains is cut down.

## How the table is built

- Packages: the 247 workspace packages (`framework/*`, `packages/*/*`, `native/landlock-run` and its three sub-packages, `apps/*`). Every package is in exactly one row; the generator asserts that the rows partition the set and that every fx path cited exists under /workspace/fx/fx.
- **cut**: fx does the job natively. The row cites the fx source path as evidence. The freddie package is deleted in stage 5 once a parity witness shows the fx behaviour matches. Existence of the path is the evidence here; behaviour is compared at the cut.
- **move**: no verified fx counterpart (Cordis, the web UI and its backend, orchestration fx lacks, freddie's own contracts). It keeps running in txiki unchanged apart from the runtime seam.
- **drop**: no shipped profile loads it, or it is Windows-only. A drop row is a deletion candidate; the ones already deleted are listed below.
- "Shipped profile" means the four in-box profiles (web, headless, acp, sdk), the agent presets under `apps/cli/config/agent-presets`, and the bundles under `packages/bundle`. A package counts as loaded if a profile, preset or bundle names it, or a loaded package depends on it at run time.
- Lines are source lines (js, mjs, cjs, ts, css, html, json, zig, c, h, rs) per package, excluding `node_modules`, `dist`, `build` and every `vendor` directory, and excluding `package.json`.

## Totals

| decision | packages now | source lines now | packages before this pass |
|---|---|---|---|
| cut | 87 | 45043 | 87 |
| move | 159 | 144601 | 159 |
| drop | 1 | 117 | 9 |
| total | 247 | 189761 | 255 |

## Cut table

| decision | family | packages | lines | fx evidence | reason | packages in the row |
|---|---|---|---|---|---|---|
| cut | browser-experimental | 5 | 852 | fx/src/tools/browser | fx has a native Browser tool | browser-use, computer-use, experimental-browser-use-browserskill, experimental-browser-use-chrome-devtools-mcp, experimental-browser-use-runtime |
| cut | code-runtime | 2 | 1204 | fx/src/core/runcode | fx runs code natively | code-runtime, code-runtime-worker-thread |
| cut | compaction | 5 | 1978 | fx/src/core/compactor | fx has a native compactor | command-compact, compaction, compaction-basic, compaction-image-offload, compaction-tool-result-pruner |
| cut | context-attachments | 2 | 958 | fx/src/core/image | fx reads images natively | attachment, attachment-local |
| cut | context-attachments | 3 | 246 | fx/src/core/output | fx retains tool output natively | spill, spill-local, spill-policy |
| cut | context-attachments | 1 | 1345 | fx/src/builtins/instruction_watch.zig | fx watches instruction files natively | agent-instructions |
| cut | delegation-planning | 14 | 7915 | fx/src/core/subagent | fx has native subagents, goals, todo and cron | command-goal, goal, goal-round-driver, plan-mode, schedule, subagent, subagent-fork-in-process, subagent-in-process-driver, subagent-spawn-in-process, tool-goal, tool-subagent, tool-subagent-control, tool-subagent-report, tool-todo |
| cut | files | 5 | 3026 | fx/src/tools/filesystem | fx has native file tools | fs, fs-local, tool-fs, tool-fs-search, tool-str-replace-editor |
| cut | host-transport | 1 | 598 | fx/src/acp | fx has a native ACP server | acp |
| cut | interaction-permissions | 6 | 2128 | fx/src/core/permissions | fx has a native permission gate and approval flow | auto-review, commands, permission-presets, tool-ask-user, user-approval, user-questions |
| cut | loop-composition | 10 | 7184 | fx/src/core/agent | fx has the native agent loop, session and tool dispatch | agent, agent-default-model, agent-loop, agent-tool-presentation, repeat-tool-reminder, scope, session, system-prompt, tool-call-timeout-policy, tools |
| cut | mcp | 1 | 704 | fx/src/mcp | fx has a native MCP client | mcp-client |
| cut | model | 5 | 6153 | fx/src/builtins/providers.zig | fx has native providers, including an anthropic-messages codec | llm, llm-deepseek, llm-pi-ai, llm-retry, token-meter |
| cut | shell-jobs | 12 | 4326 | fx/src/core/shell_command | fx has native shell, jobs and terminal | bash-local, jobs, jobs-local, shell, shell-env, subprocess, subprocess-local, terminal, terminal-bash, tool-bash, tool-bash-persistent, tool-jobs |
| cut | skills | 3 | 1761 | fx/src/core/skills | fx has native skills | skill, skill-filesystem, tool-skill |
| cut | state-policy | 1 | 726 | fx/src/core/workspace | fx has a native workspace model | workspace |
| cut | state-policy | 1 | 242 | fx/src/core/auth | fx has native auth | authorization |
| cut | state-policy | 2 | 732 | fx/src/core/auth | fx has native credentials | credentials, credentials-local |
| cut | state-policy | 3 | 916 | fx/src/core/feedback | fx has native feedback | anonymous-user-id, command-feedback, message-feedback |
| cut | state-policy | 2 | 815 | fx/src/core/config | fx has native settings | settings, settings-file |
| cut | web | 3 | 1234 | fx/src/tools/web | fx has native FetchURL and WebSearch | tool-web, web, web-fetch-http |
| move | code-runtime | 1 | 4752 | - | Cordis extension runner; fx has no Cordis | cordis-host-runner |
| move | code-runtime | 1 | 5865 | - | Cordis extension tool; fx has no Cordis | tool-cordis |
| move | composition-boot | 20 | 7615 | - | Cordis composition, profiles and boot are freddie-owned; fx has no Cordis (docs/fx-split.md, composition-boot) | acp-app, agent-presets, app-boot, base, cmdline, config-editor, cordis, cordis-plugin-group, cordis-plugin-hmr, cordis-plugin-include, cordis-plugin-loader, cordis-plugin-timer, cosmokit, freddie, headless, persona, plugin-manager, schemastery, sdk-app, web-app |
| move | composition-boot | 1 | 12 | - | profile; fx has no Cordis | agent-team-profile |
| move | composition-boot | 1 | 7463 | - | rewritten on fx:host in stage 4; the only seam to the host | runtime |
| move | context-attachments | 3 | 1944 | - | freddie reference semantics | file-reference, file-reference-local, session-reference |
| move | context-attachments | 2 | 596 | - | no verified fx counterpart | time-context, tmux-context |
| move | delegation-planning | 2 | 1855 | - | fx has no agent-team workflow; superagent and tower are not compared | experimental-agent-team, experimental-tool-agent-team |
| move | delegation-planning | 1 | 405 | - | fx has no ralph loop | tool-ralph |
| move | delegation-planning | 3 | 2118 | - | fx has no workflow scripts | tool-workflow, workflow, workflow-worker-thread |
| move | files | 1 | 78 | - | freddie policy; no verified fx counterpart | fs-observation-policy |
| move | files | 1 | 125 | - | stays with the sandbox decision (gap G2) | fs-sandbox |
| move | gui | 53 | 76504 | - | GUI JavaScript stays; served and hot reloaded from the JS root | client-connection, client-css-manifest, client-file-upload, client-hmr, client-locale, client-modules, client-shortcuts, client-ui-agent-preset, client-ui-artifacts, client-ui-attachment, client-ui-brand-official, client-ui-commands, client-ui-conversation, client-ui-cordis, client-ui-deliverables, client-ui-directory-picker-browse, client-ui-directory-picker-native, client-ui-goal, client-ui-input-trigger, client-ui-jobs, client-ui-layout, client-ui-message-feedback, client-ui-model-selection, client-ui-open-in-app, client-ui-permission-presets, client-ui-plan, client-ui-primitives, client-ui-reference, client-ui-renderer, client-ui-settings, client-ui-settings-general, client-ui-settings-models, client-ui-settings-plugin-inventory, client-ui-settings-plugins, client-ui-settings-subagent, client-ui-settings-web-search, client-ui-sidebar, client-ui-skill, client-ui-slots, client-ui-subagent, client-ui-theme, client-ui-tool, client-ui-trajectory, client-ui-user-questions, client-ui-workflow-run, client-ui-workspace, client-ui-workspace-files, client-vendor-modules, client-web, cordis-client-runner, session-log-export, web-frontend, webjsx |
| move | gui | 1 | 5248 | - | rewritten on fx:host in stage 4; the only seam to the host | client-runtime |
| move | host-transport | 1 | 210 | - | freddie SDK JSON-RPC; libfx has its own protocol (docs/host-interface.md section 3) | sdk-protocol |
| move | host-transport | 17 | 9248 | - | web UI backend, controllers and pickers; served through fx:host serve (docs/host-interface.md section 4, planned, gap G3) | api-plugin-manager-controller, api-settings-controller, api-workspace-controller, api-workspace-files, host-apiproxy, host-directory-picker, host-directory-picker-auto, host-directory-picker-browse, host-directory-picker-native, host-frontend-static, host-open-in-app, host-plugin-inventory, host-product-telemetry-otel, host-webserver, sdk-jsonrpc-server, typert-loader, typert-protocol |
| move | sandbox | 6 | 757 | - | fx has no OS sandbox beyond the permission layer (gap G2); the freddie sandbox stays until fx supplies one | node-addon-landlock-run, node-addon-landlock-run-linux-arm64, node-addon-landlock-run-linux-x64, sandbox, sandbox-local, sandbox-policy |
| move | sandbox | 1 | 1025 | - | sandbox decision (gap G2) | node-addon-landlock-run-workspace |
| move | session-log | 16 | 7594 | - | event-sourced format kept only as the projection the web UI reads (gap G4: three session formats exist) | session-artifacts, session-checkpoint-policy, session-persistence, session-persistence-jsonl, session-projection, session-projection-cache, session-query, session-query-sqlite, session-stats, session-telemetry, session-telemetry-otel, session-title, session-title-all-prompts-llm, session-title-first-prompt-llm, session-title-llm, session-turn-outline |
| move | session-log | 1 | 1180 | - | reads the freddie session format | tool-session-query |
| move | shell-jobs | 1 | 105 | - | stays with the sandbox decision (gap G2) | bash-sandbox |
| move | skills | 1 | 56 | - | badge shown in the web UI | skill-badge |
| move | split | 7 | 6366 | - | agent host half moves with the web UI backend; client half is GUI JavaScript | api-gateway, api-remotes, job-controller, remote-stream, session-controller, terminal-controller, typert-registry |
| move | state-policy | 5 | 2306 | - | settings, credentials and storage stay freddie contracts until compared in stage 5 | inspector, invariants, storage, storage-domain, storage-json |
| move | util | 12 | 1174 | - | shared primitives; copies follow the host interface in stage 4 | atomic-write, brand, crypto, deque, home-paths, http-proxy, launch-environment, native-command, output-retention, time, timeout, values |
| drop | composition-boot | 1 | 117 | - | no profile, preset or source loads it | cordis-plugin-logger-console |

## Deleted so far (stage 7)

- Demos: `packages/examples/acp-demo`, `packages/examples/agent-spine-demo`, the `examples` workspace (`freddie-examples`, `examples/acp-agent`, `examples/web-cordis`), `scripts/demo-code-mode.mjs`, `scripts/demo-cordis.mjs` and the three `demo:*` scripts (commit f8abae66).
- Windows-only: `pwsh-local`, `pwsh-sandbox`, `tool-pwsh`, `tool-pwsh-persistent`, `sandbox-windows-acl`; the `pwsh` dialect of `terminal-bash`; the Windows ACL path of `sandbox-local`; `windows-inspector.js` and the `koffi` dependency of `subprocess-local`; the `win32` gating on the bash rows of the base, web and headless bundles and the agent presets; CI moved from `windows-latest` under `pwsh` to `ubuntu-latest` (commit abdd8a93).
- Package shells: 26 directories under `packages/` that held only `node_modules` and no `package.json` (the plan said 16). None was tracked by git, so this is a disk cleanup with no commit.
- Still a drop row, not deleted: `framework/logger-console` (`@freddie/cordis-plugin-logger-console`). No profile, preset or source loads it, but it is a published member of the vendor release family and appears in `scripts/rescope-vendor.js`, `THIRD_PARTY_NOTICES.md`, `docs/rescope.md` and the plugin tutorial. Deleting it removes a published package, so it waits for the owner's decision.
- Windows branches left in place (platform code inside packages that stay): 271 matching lines in 39 files. They are independent features (the file-manager and application launchers, the native directory picker, process and terminal teardown), not tied to a deleted package.

| package | files with a Windows branch | matching lines |
|---|---|---|
| packages/host/open-in-app | 3 | 75 |
| packages/client/ui-conversation | 1 | 33 |
| packages/host/directory-picker-native | 5 | 31 |
| packages/fs/fs-local | 2 | 30 |
| packages/session/session-persistence-jsonl | 2 | 28 |
| packages/subprocess/subprocess-local | 3 | 28 |
| packages/host/apiproxy | 1 | 13 |
| packages/client/shortcuts | 4 | 6 |
| packages/api/terminal-controller | 2 | 5 |
| packages/client/runtime | 1 | 4 |
| packages/client/ui-open-in-app | 2 | 3 |
| packages/host/directory-picker-browse | 1 | 3 |
| (other) scripts | 2 | 2 |
| packages/attachment/attachment-local | 1 | 1 |
| total | 39 | 271 |


## Node APIs used by packages/util/runtime

The runtime object has 25 members (`fs, fsPromises, path, crypto, stream, buffer, url, util, utilTypes, module, childProcess, os, workerThreads, asyncHooks, vm, http, https, zlib, inspector, stringDecoder, perfHooks, timersPromises, net, dnsPromises, process`); `src/node.js` imports the 25 matching `node:` modules for the Node install. The shims below export 120 names. The last column is the `fx:host` entry from host-interface.md section 4.1, or the named gap (G1 to G14 in that file).

| runtime subpath | exported names | fx:host entry or named gap |
|---|---|---|
| async-hooks | AsyncLocalStorage | engine support (named gap G12) |
| buffer | Buffer, constants | pure JavaScript over Uint8Array; no host entry (gap G6 in the embedded cordis copy) |
| child-process | exec, execFile, execFileSync, spawn, spawnSync | proc.spawn (run-to-completion run_command exists; streaming spawn planned, G7) |
| crypto | createHash, randomBytes, randomUUID | crypto.* (randomBytes and hash exist; hmac, subtle and timingSafeEqual planned) |
| dns-promises | default | dns.* (planned); lookup is built on tjs.lookup today |
| fs-promises | access, chmod, constants, cp, link, lstat, mkdir, mkdtemp, open, opendir, readFile, readdir, readlink, realpath, rename, rm, stat, symlink, truncate, unlink, writeFile | fs.* (async binding planned); opendir is fs.readdir plus a JavaScript iterator (planned) |
| fs | accessSync, closeSync, constants, createReadStream, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, unwatchFile, watchFile, writeFileSync, writeSync | fs.* (22 sync host verbs exist; async binding and gate planned); watchFile and unwatchFile go to watch (planned, G5); createReadStream is fs.open plus a JavaScript stream (planned) |
| http | createServer, validateHeaderValue, default | createServer: serve (planned, G3); validateHeaderValue is pure JavaScript |
| https | default | client: fetch (planned) |
| inspector | Session | none (named gap G14): drop or stub |
| module | createRequire, stripTypeScriptTypes | loader (planned); createRequire is pure JavaScript in the runtime |
| net | isIP | net.connect and net.listen (planned, G9); isIP is pure JavaScript |
| os | availableParallelism, constants, homedir, networkInterfaces, platform, release, tmpdir | os.* (partial through process_info) |
| path | basename, delimiter, dirname, extname, isAbsolute, join, normalize, parse, posix, relative, resolve, sep, toNamespacedPath, win32 | pure JavaScript in the runtime; no host entry |
| perf-hooks | performance | pure JavaScript; performance.now needs timers.now (planned) |
| process |  | process_info host verb and proc.exit (exit planned, G8) |
| stream | PassThrough, Readable, Writable, pipeline | pure JavaScript; no host entry (gap G6 in the embedded cordis copy) |
| string-decoder | StringDecoder | pure JavaScript in the runtime; no host entry |
| timers-promises | scheduler, setTimeout | pure JavaScript in the runtime over timers (exists) |
| url | fileURLToPath, pathToFileURL | pure JavaScript in the runtime; no host entry |
| util-types | isPromise | pure JavaScript in the runtime; no host entry |
| util | TextDecoder, inspect, isDeepStrictEqual, parseArgs, parseEnv, promisify | pure JavaScript in the runtime; no host entry |
| vm | Script, createContext, runInContext, runInNewContext | host.eval (named gap G13) |
| worker-threads | MessageChannel, Worker, parentPort, workerData | host.worker (named gap G11) |
| zlib | brotliCompress, constants, createGunzip, createInflate, createZstdDecompress, gunzip, gzip, zstdCompress, zstdDecompress, zstdDecompressSync, default | zlib.* (planned, G10); gzip, gunzip, createGunzip and createInflate are pure JavaScript in the runtime |


Call-site counts for the names that are absent or stubbed on txiki are in [PENDING_VALIDATION.md](PENDING_VALIDATION.md) (ranked open items). The txiki adapter in `src/txiki.js` implements most of this surface in JavaScript today; the rewrite on `fx:host` (stage 4) replaces the adapter's `tjs.*` calls, not the shims.

## node: imports outside the runtime

131 `node:` imports in 42 files: 46 in package source and apps (16 files, below), 47 in `scripts/` and 38 in `native/landlock-run`. By module: path 36, fs 29, child_process 16, url 15, crypto 10, util 8, module 5, os 5, fs/promises 3, timers/promises 2, assert/strict 1, readline/promises 1. A new one in package source should fail a check once stage 4 starts.

| file | node: modules imported |
|---|---|
| apps/cli/src/bin.js | node:fs, node:url |
| apps/cli/src/dump-config.js | node:fs, node:path |
| apps/cli/src/expose-internals.js | node:child_process |
| apps/cli/src/plugin.js | node:child_process, node:fs, node:path |
| apps/cli/src/profile-boot.js | node:fs, node:path, node:url |
| packages/client/connection/src/websocket-downlink.js | node:crypto |
| packages/client/css-manifest/scripts/generate-manifest.mjs | node:child_process, node:fs, node:path, node:url |
| packages/client/css-manifest/src/index.js | node:crypto, node:fs, node:path, node:url |
| packages/client/file-upload/src/index.js | node:crypto, node:fs/promises, node:path |
| packages/client/file-upload/src/intake.js | node:crypto, node:fs/promises |
| packages/client/file-upload/src/staging.js | node:crypto, node:fs/promises, node:path |
| packages/client/hmr/src/index.js | node:fs, node:module, node:path, node:url |
| packages/client/modules/src/index.js | node:crypto, node:fs, node:module, node:path |
| packages/client/vendor-modules/scripts/generate-vendor.mjs | node:fs, node:module, node:path, node:url |
| packages/client/vendor-modules/src/index.js | node:module, node:path, node:url |
| packages/subprocess/subprocess-local/scripts/ensure-spawn-helper.mjs | node:fs, node:path, node:url |


## Stage 4 groundwork: the agent side under txiki

Method. gm's embedded txiki (`gm-core`, the host the parity runs use; there is no standalone `tjs` binary on this machine) was given a mirror of the workspace sources in which every `@freddie/*` and `@cordis/*` specifier is rewritten to an absolute mirror path (including `exports` patterns), the txiki runtime installed, and every runtime-closure package entry imported in turn. Third-party and `node:` specifiers were left alone, so what fails is what a loader or a rewrite has to supply.

Result. 203 of 240 package entries import and evaluate. The 37 that fail are listed by first cause; a package may have further causes behind the first.

| cause | packages that fail on it |
|---|---|
| node import in package source: node:crypto | 3: client-css-manifest, client-file-upload, client-modules |
| node import in package source: node:child_process | 2: node-addon-landlock-run, sandbox-local |
| node import in package source: node:fs | 1: client-hmr |
| node import in package source: node:module | 1: client-vendor-modules |
| third-party: js-yaml | 7: agent-presets, app-boot, client-connection, config-editor, cordis-plugin-include, host-apiproxy, web-app |
| third-party: chokidar | 4: cordis-plugin-hmr, credentials-local, settings-file, skill-filesystem |
| third-party: zod | 2: session-controller, typert-registry |
| third-party: @modelcontextprotocol/sdk | 2: experimental-browser-use-chrome-devtools-mcp, mcp-client |
| third-party: @opentelemetry/sdk-logs | 2: host-product-telemetry-otel, session-telemetry-otel |
| third-party: eventsource-parser | 2: llm-deepseek, sdk-jsonrpc-server |
| third-party: @agentclientprotocol/sdk | 1: acp |
| third-party: sharp | 1: attachment-local |
| third-party: clsx | 1: client-ui-primitives |
| third-party: webjsx | 1: client-web |
| third-party: diff | 1: tool-fs |
| third-party: @earendil-works/pi-ai | 1: llm-pi-ai |
| third-party: node-pty | 1: subprocess-local |
| third-party: turndown | 1: tool-web |
| txiki gap: process.stdout | 2: cmdline, headless |
| txiki gap: zlib.constants.ZSTD_c_checksumFlag | 1: session-persistence-jsonl |


Finding about the loader. In gm's host `import.meta` has no keys (no `url`, `filename`, `dirname`, `resolve`), and `tjs.setImportMap` does not affect dynamic `import()`. Without the mirror's `import.meta.url`, 76 of the 240 entries fail on one line, `createRequire(import.meta.url)('../package.json')`, and only 129 import. Use in freddie sources (excluding the runtime and vendored client modules): `import.meta.url` 25 files / 32 uses, `import.meta.dirname` 4 / 4, `import.meta.filename` 1 / 1, `import.meta.resolve` 3 / 3.

## Third-party packages the agent side needs

49 packages are runtime `dependencies` of the loaded set (versions as declared). The fx loader (host-interface.md section 5.2, `<root>/node_modules` resolution) has to serve the agent-side ones as ES modules, or they must be bundled or replaced by a native capability.

| package | version range | used by | agent-side or GUI |
|---|---|---|---|
| zod | ^4.4.3 | 18: api-plugin-manager-controller, api-settings-controller, api-workspace-controller, api-workspace-files, commands, cordis-host-runner ... | agent |
| clsx | ^2.1.1 | 14: client-ui-attachment, client-ui-commands, client-ui-conversation, client-ui-directory-picker-browse, client-ui-input-trigger, client-ui-model-selection ... | GUI |
| commander | ^15.0.0 | 5: acp-app, freddie, headless, sdk-app, web-app | agent |
| js-yaml | ^5.4.1 | 5: agent-presets, app-boot, config-editor, cordis-plugin-include, skill-filesystem | agent |
| chokidar | ^5.0.0 | 4: cordis-plugin-hmr, credentials-local, settings-file, skill-filesystem | agent |
| diff | ^9.0.0 | 3: client-ui-trajectory, client-vendor-modules, tool-fs | both |
| koffi | ^3.1.0 | 3: fs-local, host-directory-picker-native, session-persistence-jsonl | agent |
| yaml | ^2.9.0 | 3: config-editor, credentials-local, settings-file | agent |
| @opentelemetry/api-logs | ^0.220.0 | 2: host-product-telemetry-otel, session-telemetry-otel | agent |
| @opentelemetry/exporter-logs-otlp-http | ^0.220.0 | 2: host-product-telemetry-otel, session-telemetry-otel | agent |
| @opentelemetry/resources | ^2.9.0 | 2: host-product-telemetry-otel, session-telemetry-otel | agent |
| @opentelemetry/sdk-logs | ^0.220.0 | 2: host-product-telemetry-otel, session-telemetry-otel | agent |
| @shikijs/langs | ^4.3.1 | 2: client-ui-primitives, client-vendor-modules | GUI |
| @tanstack/virtual-core | ^3.17.7 | 2: client-ui-trajectory, client-vendor-modules | GUI |
| anser | ^2.3.5 | 2: client-ui-primitives, client-vendor-modules | GUI |
| katex | ^0.16.47 | 2: client-ui-primitives, client-vendor-modules | GUI |
| mdast-util-from-markdown | ^2.0.3 | 2: client-ui-primitives, client-vendor-modules | GUI |
| mdast-util-gfm | ^3.1.0 | 2: client-ui-primitives, client-vendor-modules | GUI |
| mdast-util-math | ^3.0.0 | 2: client-ui-primitives, client-vendor-modules | GUI |
| micromark-core-commonmark | ^2.0.3 | 2: client-ui-primitives, client-vendor-modules | GUI |
| micromark-extension-gfm | ^3.0.0 | 2: client-ui-primitives, client-vendor-modules | GUI |
| micromark-extension-math | ^3.1.0 | 2: client-ui-primitives, client-vendor-modules | GUI |
| micromark-factory-space | ^2.0.1 | 2: client-ui-primitives, client-vendor-modules | GUI |
| micromark-util-character | ^2.1.1 | 2: client-ui-primitives, client-vendor-modules | GUI |
| micromark-util-classify-character | ^2.0.1 | 2: client-ui-primitives, client-vendor-modules | GUI |
| micromark-util-sanitize-uri | ^2.0.1 | 2: client-ui-primitives, client-vendor-modules | GUI |
| micromark-util-symbol | ^2.0.1 | 2: client-ui-primitives, client-vendor-modules | GUI |
| micromark-util-types | ^2.0.2 | 2: client-ui-primitives, client-vendor-modules | GUI |
| shiki | ^4.3.1 | 2: client-ui-primitives, client-vendor-modules | GUI |
| ws | ^8.21.0 | 2: client-connection, client-hmr | GUI |
| @agentclientprotocol/sdk | 0.25.1 | 1: acp | agent |
| @babel/code-frame | ^7.29.0 | 1: cordis-plugin-hmr | agent |
| @earendil-works/pi-ai | ^0.85.1 | 1: llm-pi-ai | agent |
| @joplin/turndown-plugin-gfm | ^1.0.67 | 1: tool-web | agent |
| @modelcontextprotocol/sdk | ^1.29.0 | 1: mcp-client | agent |
| @opentelemetry/api | ^1.9.1 | 1: session-telemetry-otel | agent |
| @vscode/ripgrep | ^1.18.0 | 1: tool-fs-search | agent |
| chrome-devtools-mcp | 1.9.0 | 1: experimental-browser-use-chrome-devtools-mcp | agent |
| es-module-lexer | ^3.0.3 | 1: client-modules | GUI |
| eventsource-parser | ^3.1.0 | 1: llm-deepseek | agent |
| fflate | ^0.8.2 | 1: host-apiproxy | agent |
| libsql-plugkit-client | github:AnEntrypoint/libsql-plugkit-client | 1: session-query-sqlite | agent |
| node-addon-require-builtin | ^0.1.4 | 1: freddie | agent |
| node-pty | 1.2.0-beta.15 | 1: subprocess-local | agent |
| open | ^11.0.0 | 1: web-app | agent |
| picomatch | ^4.0.3 | 1: cordis-plugin-hmr | agent |
| sharp | ^0.35.3 | 1: attachment-local | agent |
| turndown | ^7.2.4 | 1: tool-web | agent |
| undici | >=7.29.0 | 1: http-proxy | agent |


Replaceable by a native capability: `@vscode/ripgrep` (fx `grep_files`), `sharp` (fx `src/core/image`), `node-pty` (fx `pty`), `@modelcontextprotocol/sdk` and `@agentclientprotocol/sdk` (fx `src/mcp`, `src/acp`), `@earendil-works/pi-ai` and `eventsource-parser` (fx providers), `turndown` (fx `FetchURL`), `chrome-devtools-mcp` (fx `Browser`). Those go with their cut rows.

## What freddie needs from fx

1. **`import.meta.url`, `import.meta.dirname`, `import.meta.filename` and `import.meta.resolve`** in the fx loader. host-interface.md section 5.3 specifies only `import.meta.hot`. Evidence above: 25 files use `url`; one line in `packages/llm/llm` alone stops 76 package entries.
2. **`process.stdout`, `process.stderr` and `process.stdin`** from `fx:host`. host-interface.md lists `process_info` and `proc.exit` only. `cmdline` and `headless` fail on `process.stdout` today, and the SDK profile speaks JSON-RPC on stdio.
3. **`http.createServer` with the `upgrade` event and a raw socket**, or a decision that freddie's web backend moves to `serve({ websocket })`. host-interface.md section 4 specifies `serve` with a websocket handler (gap G3). Both callers (`host/webserver`, `runtime-diagnostics/inspector`) register an `upgrade` listener and hand `(request, socket, head)` to a WebSocket library, so the shape decides the rewrite.
4. **`zlib` with the zstd constants** (`ZSTD_c_checksumFlag` is read at import by `session-persistence-jsonl`; gap G10), plus brotli decode (`web-fetch-http`).
5. **`fs.watch`** (gap G5): chokidar is used by 4 agent-side packages (hmr, credentials-local, settings-file, skill-filesystem).
6. **Synchronous child process** (`spawnSync` 5 call sites, `execFileSync` 1; gap G7 covers streaming spawn only), **`AsyncLocalStorage`** (3 call sites; G12) and **`vm.createContext` / `runInContext`** (4 call sites; G13).
7. The status of `fx:host` itself (generated module, `fx js`, the import map). The survey above ran on gm's host because `fx:host` does not exist yet; the runtime rewrite starts when it does.

## Line ledger per family (before and after this pass)

Before is commit 7ac74a2e; after is the working tree of this pass. Counts are source lines as defined above, not documentation.

| family | packages before | packages after | source lines before | source lines after | removed |
|---|---|---|---|---|---|
| browser-experimental | 5 | 5 | 852 | 852 | 0 |
| code-runtime | 4 | 4 | 11821 | 11821 | 0 |
| compaction | 5 | 5 | 1978 | 1978 | 0 |
| composition-boot | 23 | 23 | 15224 | 15207 | 17 |
| context-attachments | 11 | 11 | 5089 | 5089 | 0 |
| delegation-planning | 20 | 20 | 12293 | 12293 | 0 |
| examples | 3 | 0 | 247 | 0 | 247 |
| files | 7 | 7 | 3229 | 3229 | 0 |
| gui | 54 | 54 | 81754 | 81752 | 2 |
| host-transport | 19 | 19 | 10056 | 10056 | 0 |
| interaction-permissions | 6 | 6 | 2128 | 2128 | 0 |
| loop-composition | 10 | 10 | 7184 | 7184 | 0 |
| mcp | 1 | 1 | 704 | 704 | 0 |
| model | 5 | 5 | 6153 | 6153 | 0 |
| sandbox | 8 | 7 | 3277 | 1782 | 1495 |
| session-log | 17 | 17 | 8774 | 8774 | 0 |
| shell-jobs | 17 | 13 | 5859 | 4431 | 1428 |
| skills | 4 | 4 | 1817 | 1817 | 0 |
| split | 7 | 7 | 6366 | 6366 | 0 |
| state-policy | 14 | 14 | 5737 | 5737 | 0 |
| util | 12 | 12 | 1174 | 1174 | 0 |
| web | 3 | 3 | 1234 | 1234 | 0 |
| total | 255 | 247 | 192950 | 189761 | 3189 |
