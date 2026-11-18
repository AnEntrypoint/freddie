# fx split: inventory and dedup

Stage 0 inventory, and the Phase A dedup merges it proved safe. The inventory is read-only; code changed only where listed under Merged in Phase A. No build, test, push or witness ran in this stage. Each merge has a Phase B witness in [PENDING_VALIDATION.md](PENDING_VALIDATION.md).

## Direction and premise

- Target: the agent side of Cordis runs in an embedded txiki.js inside fx. Freddie keeps only the pure-GUI JavaScript.
- Premise check: fx has no embedded txiki in its source. A search of /workspace/fx/fx for txiki returns nothing; the one mention is a memory note at /workspace/fx/memory. gm embeds txiki at native/components/quickjs/txiki and native/third_party/txiki; thebird embeds it at scripts/txiki. The move is therefore a plan for fx, not a capability fx has now.
- The fx run_code witness gates the agent move. The 2026-11-10 fx audit (/workspace/fx/issues.md, issue 1) records the gm run_code gate as open. This checkout did not re-verify it.

## Counts

255 workspace packages: 237 under packages/, 10 under framework/, 8 under apps/, examples/ and native/.

| Side | Packages |
|---|---|
| agent-side | 194 |
| GUI-side | 54 |
| split (agent host half, GUI client half) | 7 |

Classification rule. GUI-side: packages/client/*, apps/web, packages/extensions/ui-cordis, packages/extensions/cordis-client-runner, packages/session-query/session-log-export, framework/webjsx. Split: packages with browser halves and agent-side host halves (packages/api/*, packages/typert/registry). Agent-side: everything else. Each package is filed under one family by its directory group. The family sets its fx-native coverage and its move.

## Agent-side families

Per-package verdicts are the family verdict. "Live" means the fx audit exercised it in a live session. "Source" means fx's src has a module of that name; its behaviour was not compared.

| family | agent-side packages | fx native coverage (evidence) | must move | packages |
|---|---|---|---|---|
| composition-boot | 22 | none: Cordis is Freddie-owned | the Cordis composition the agent needs moves to txiki with the loop; boot, CLI and GUI boot stay JavaScript | @freddie, @cordis, @cosmokit, @cordis-plugin-group, @cordis-plugin-hmr, @cordis-plugin-include, @cordis-plugin-loader, @cordis-plugin-logger-console, @schemastery, @cordis-plugin-timer, app-boot, cmdline, config-editor, plugin-manager, acp-app, agent-team-profile, base, headless, sdk-app, web-app, agent-presets, persona |
| examples | 4 | n/a | the kept leaves stay; no fx counterpart needed | acp-agent-example, freddie-examples, acp-demo, agent-spine-demo |
| sandbox | 8 | source: 13 fx files name landlock or sandbox; enforcement not verified | decide before stage 2: keep the Freddie sandbox or port it to fx; native/landlock-run ships as before | @node-addon-landlock-run-workspace, @node-addon-landlock-run, @node-addon-landlock-run-linux-arm64, @node-addon-landlock-run-linux-x64, sandbox-local, sandbox-policy, sandbox-windows-acl, sandbox |
| host-transport | 19 | source: src/acp, builtins/gateway | agent-side Remote hosts (api/*, sdk/*, acp, host/apiproxy) move to fx gateway in stage 2; client halves stay JavaScript | acp, api-plugin-manager-controller, api-settings-controller, api-workspace-controller, api-workspace-files, host-apiproxy, host-directory-picker-auto, host-directory-picker-browse, host-directory-picker-native, host-directory-picker, host-frontend-static, host-open-in-app, host-plugin-inventory, host-product-telemetry-otel, host-webserver, sdk-protocol, sdk-jsonrpc-server, typert-loader, typert-protocol |
| context-attachments | 11 | live: image reading; source: core/image, core/images | the attachment store and file references move with the loop | attachment-local, attachment, agent-instructions, file-reference-local, file-reference, session-reference, time-context, tmux-context, spill-local, spill-policy, spill |
| browser-experimental | 5 | source: core/browser, src/tools/browser | experimental; decide per package; nothing moves now | browser-use, computer-use, experimental-browser-use-browserskill, experimental-browser-use-chrome-devtools-mcp, experimental-browser-use-runtime |
| code-runtime | 4 | source: core/runcode | the worker-thread code runtime is kept or replaced after comparison with fx runcode | code-runtime-worker-thread, code-runtime, cordis-host-runner, tool-cordis |
| compaction | 5 | source: core/compactor | compare fx compactor with compaction-basic and keep one | command-compact, compaction-basic, compaction-image-offload, compaction-tool-result-pruner, compaction |
| loop-composition | 10 | source: core/agent, core/session, core/tooling. Live: none of the loop itself | the loop and tool dispatch, in stage 2 after the fx run_code witness; guard moves with them | agent-default-model, agent-loop, agent-tool-presentation, agent, scope, session, system-prompt, tools, repeat-tool-reminder, tool-call-timeout-policy |
| state-policy | 14 | source: core/config, core/auth, core/workspace; parity not compared | settings, credentials and storage stay Freddie contracts until compared | authorization, credentials-local, credentials, command-feedback, message-feedback, anonymous-user-id, inspector, invariants, settings-file, settings, storage-domain, storage-json, storage, workspace |
| delegation-planning | 20 | live: Agent (explore), TodoList, plan-mode approval, CronCreate, CronList, CronDelete; source: core/subagent, core/goal, core/todo, core/cron | workflow, ralph, goal, schedule and agent-team semantics: map each to an fx primitive or keep as a tool; nothing moves in this stage | experimental-agent-team, experimental-tool-agent-team, command-goal, goal-round-driver, goal, tool-goal, plan-mode, schedule, subagent-fork-in-process, subagent-in-process-driver, subagent-spawn-in-process, subagent, tool-subagent-control, tool-subagent-report, tool-subagent, tool-todo, tool-ralph, tool-workflow, workflow-worker-thread, workflow |
| files | 7 | live: read_file, write_file, edit_file, glob_files, grep_files; source: src/tools/filesystem | the Freddie fs seam and tools map onto fx filesystem tools in stage 2; fs-sandbox stays with sandbox | fs-local, fs-observation-policy, fs-sandbox, fs, tool-fs-search, tool-fs, tool-str-replace-editor |
| interaction-permissions | 6 | live: AskUserQuestion, plan-mode approval; source: core/permissions | Freddie permission presets and the user-approval seam map onto fx permissions in stage 2 | auto-review, commands, permission-presets, tool-ask-user, user-approval, user-questions |
| shell-jobs | 17 | live: Bash foreground and background, TaskList, TaskOutput, TaskStop; source: core/shell_command, core/terminal | the bash and pwsh executors and persistent tools move with the loop; PowerShell has no verified fx counterpart | jobs-local, jobs, tool-jobs, bash-local, bash-sandbox, pwsh-local, pwsh-sandbox, shell-env, shell, tool-bash-persistent, tool-bash, tool-pwsh-persistent, tool-pwsh, subprocess-local, subprocess, terminal-bash, terminal |
| model | 5 | source: builtins/providers.zig; provider behaviour not verified | the llm seam and its adapters move with the loop; deepseek and pi-ai both kept until a decision | llm-deepseek, llm-pi-ai, llm-retry, llm, token-meter |
| mcp | 1 | live: MCP tool calls; source: src/mcp, core/mcp | the mcp-client bridge becomes fx MCP configuration | mcp-client |
| session-log | 17 | source: core/session, core/session_manager; fx log format is not Freddie SESSION_FORMAT_VERSION | the Freddie session log is the durable contract: port it under the fx loop or keep it; a decision is needed | session-query-sqlite, session-query, tool-session-query, session-artifacts, session-checkpoint-policy, session-persistence-jsonl, session-persistence, session-projection-cache, session-projection, session-stats, session-telemetry-otel, session-telemetry, session-title-all-prompts-llm, session-title-first-prompt-llm, session-title-llm, session-title, session-turn-outline |
| skills | 4 | live: Skill, install_skill; source: builtins/skills.zig, core/skills | skill providers move onto fx skills | skill-badge, skill-filesystem, skill, tool-skill |
| util | 12 | none needed: shared primitives | agent-side copies follow stage 2; GUI-side copies stay in JavaScript | atomic-write, brand, crypto, deque, home-paths, http-proxy, launch-environment, native-command, output-retention, time, timeout, values |
| web | 3 | live: FetchURL; source: src/tools/web; web_search provider not verified | web_fetch and the web_search provider choice | tool-web, web-fetch-http, web |

## GUI-side packages

apps/web (web-frontend), framework/webjsx (@webjsx), p/client/connection (client-connection), p/client/css-manifest (client-css-manifest), p/client/file-upload (client-file-upload), p/client/hmr (client-hmr), p/client/locale (client-locale), p/client/modules (client-modules), p/client/runtime (client-runtime), p/client/shortcuts (client-shortcuts), p/client/ui-agent-preset (client-ui-agent-preset), p/client/ui-artifacts (client-ui-artifacts), p/client/ui-attachment (client-ui-attachment), p/client/ui-brand-official (client-ui-brand-official), p/client/ui-commands (client-ui-commands), p/client/ui-conversation (client-ui-conversation), p/client/ui-deliverables (client-ui-deliverables), p/client/ui-directory-picker-browse (client-ui-directory-picker-browse), p/client/ui-directory-picker-native (client-ui-directory-picker-native), p/client/ui-goal (client-ui-goal), p/client/ui-input-trigger (client-ui-input-trigger), p/client/ui-jobs (client-ui-jobs), p/client/ui-layout (client-ui-layout), p/client/ui-message-feedback (client-ui-message-feedback), p/client/ui-model-selection (client-ui-model-selection), p/client/ui-open-in-app (client-ui-open-in-app), p/client/ui-permission-presets (client-ui-permission-presets), p/client/ui-plan (client-ui-plan), p/client/ui-primitives (client-ui-primitives), p/client/ui-reference (client-ui-reference), p/client/ui-renderer (client-ui-renderer), p/client/ui-settings-general (client-ui-settings-general), p/client/ui-settings-models (client-ui-settings-models), p/client/ui-settings-plugin-inventory (client-ui-settings-plugin-inventory), p/client/ui-settings-plugins (client-ui-settings-plugins), p/client/ui-settings-subagent (client-ui-settings-subagent), p/client/ui-settings-web-search (client-ui-settings-web-search), p/client/ui-settings (client-ui-settings), p/client/ui-sidebar (client-ui-sidebar), p/client/ui-skill (client-ui-skill), p/client/ui-slots (client-ui-slots), p/client/ui-subagent (client-ui-subagent), p/client/ui-theme (client-ui-theme), p/client/ui-tool (client-ui-tool), p/client/ui-trajectory (client-ui-trajectory), p/client/ui-user-questions (client-ui-user-questions), p/client/ui-workflow-run (client-ui-workflow-run), p/client/ui-workspace-files (client-ui-workspace-files), p/client/ui-workspace (client-ui-workspace), p/client/vendor-modules (client-vendor-modules), p/client/web (client-web), p/extensions/cordis-client-runner (cordis-client-runner), p/extensions/ui-cordis (client-ui-cordis), p/session-query/session-log-export (session-log-export)

## Split packages (agent host half, GUI client half)

p/api/gateway (api-gateway), p/api/job-controller (job-controller), p/api/remote-stream (remote-stream), p/api/remotes (api-remotes), p/api/session-controller (session-controller), p/api/terminal-controller (terminal-controller), p/typert/registry (typert-registry)

## Not in any shipped profile's dependency closure

- examples/acp-agent (acp-agent-example)
- examples (freddie-examples)
- native/landlock-run (@node-addon-landlock-run-workspace)
- packages/examples/acp-demo (acp-demo)

These packages are candidates for removal in a later stage. Phase A did not remove them.

## Duplicates

### Merged in Phase A (local commits on main, not pushed)

| Duplicate | Files | Merge | Commit |
|---|---|---|---|
| sandbox runner-failure classifier, byte-identical | packages/shell/bash-sandbox/src/helpers.js, packages/shell/pwsh-sandbox/src/helpers.js | one copy at packages/sandbox/sandbox-policy/src/runner-failure.js, re-exported from sandbox-policy; both sandboxes import it from there, and both already depend on sandbox-policy | 94471ada |
| typert json parameter builder, one copy per package | packages/api/remote-stream, packages/api/session-controller, packages/api/terminal-controller: host and remote-client halves | one src/typert-parameter.js per package, imported by both halves; terminal-controller json renamed to jsonParameter | de79ae6c |
| apiproxy passthrough schema stub, identical | packages/host/apiproxy/src/api/sessions.schema.js, packages/host/apiproxy/src/api/terminals.schema.js | packages/host/apiproxy/src/api/passthrough.js | f4f3664b |
| lastStep, identical | packages/client/ui-conversation/src/client/conversation-nodes/turn-error.js, turn-max-tokens.js | exported from conversation-nodes/common.js | 1e216623 |

Each change was checked by reading its diff. Each changed JS file also passed node --check, which is a parse check and not a witness. Behaviour is unverified until Phase B.

### Proposed, not merged

| Duplicate | Files | Why not merged now | Proposed merge |
|---|---|---|---|
| atomic file writers: util/atomic-write (writeFileAtomic, six importers), storage-json writeAtomic (same tmp, rename and fsync), eight inline rename writers | packages/storage/storage-json/src/atomic.js, packages/fs/fs-local/src/fsio.js, packages/host/apiproxy/src/api-proxy.js, packages/host/apiproxy/src/fetch/handler.js, packages/session/session-title/src/index.js, packages/attachment/attachment-local/src/request-image.js, packages/api/workspace-controller/src/index.js, packages/api/session-controller/src/index.js | storage-json has no edge to util/atomic-write; adding one changes the lockfile | storage-json and the inline writers call util/atomic-write; delete storage-json/src/atomic.js |
| tool-bash and tool-pwsh helpers: processOutcome and streamText; persistent pair: maybeTruncate, nextScrollbackOffset, retainedScrollback, renderCaptured, appendStatusMarker, renderShellExitStatus | packages/shell/tool-bash/src/background.js, tool-pwsh/src/background.js, tool-bash/src/render.js, tool-pwsh/src/render.js, tool-bash-persistent/src/index.js, tool-pwsh-persistent/src/index.js | the two shells share no owner; the persistent index.js files differ by 203 diff lines | one shell-tool core parameterised by shell, owned by packages/shell/shell |
| bash-local and pwsh-local finalOutput | packages/shell/bash-local/src/index.js, packages/shell/pwsh-local/src/index.js | same owner gap | packages/shell/shell |
| typert json parameter across packages | the three per-package typert-parameter.js files | no browser code imports typert-protocol, so a shared module would be its first browser import | a browser-safe shared module, decided with the owner |
| api-catalog helpers: referencedTypeClosure, contextProperty, queryServiceApi, queryEventApi and others; readExact; errorDetails; missingServices | packages/extensions/tool-cordis/src/api-catalog.js (366 KB), packages/extensions/cordis-client-runner/src/client/api-catalog.js (51 KB), providers.js in both, runtime.js and cordis-host-runner/src/index.js, cordis-host-runner/src/lifecycle.js and tool-cordis/src/inspect.js | no edge between the two packages; the catalogs differ by 5303 diff lines | one owner for the shared helpers |
| values helpers: hasIntrinsicConstructor, isIntrinsicObjectPrototype, hasPlainArrayPrototype, deepEqualJson | packages/util/values/src/index.js, packages/core/tools/src/json-schema.js, packages/extensions/cordis-host-runner/src/guard.js, packages/settings/settings/src/index.js | needs edges core/tools to values, host-runner to values and settings to values | util/values owns them |
| sleep(ms, signal) | packages/api/job-controller/src/wake.js, packages/client/connection/src/client/connection.js, packages/workflow/workflow-worker-thread/src/host.js | the browser copy cannot import node-side helpers; whether util/timeout loads in the browser is unverified | move the node copies into util/timeout; decide the browser copy with the owner |
| truncateUnicodeCodePoints | packages/api/session-controller/src/list.js, packages/host/apiproxy/src/api/session-search.js | no edge | one util owner |
| config reads | YAML parsed in app-boot, config-editor, credentials-local, agent-presets discovery and metadata, settings-file, skill-filesystem; .env read in app-boot and credentials-local | the two .env readers do different jobs (boot, profile credentials) and were not compared | one yaml reader and one env reader in util, after the readers are compared |
| client helpers: asRecord, firstLine, sameReferences, hasVisibleContent, hasInterruptionEvidence, locationTurn, usageOutputTokens, textField, stateStatus, escapeHtmlAttribute | client/runtime context-provenance.js and ui-conversation ContextBody.js; ui-conversation ReasoningRow.js, ui-skill SkillRow.js and ui-cordis card-model.js; client/runtime conversation-location-index.js and ui-conversation chat-snapshot-builder.js and tool.js; ui-conversation assistant.js and ui-trajectory trajectory-assistant-definition.js; ui-conversation tool.js and ui-trajectory trajectory-tool-definition.js; ui-conversation turn-metrics.js and session-stats projection.js; settings-plugins and settings-web-search card-form.js; ui-skill SkillRow.js and ui-tool ToolRow.js; css-manifest index.js and host-webserver injections.js | the ui-trajectory and session-stats edges exist, but no ui-trajectory source imports ui-conversation today (checked by grep), so browser resolution of that import is unverified | export from the owning module and import it; each needs a browser witness |
| cachedMessageIconActions | packages/client/ui-conversation/src/client/chat/MessageItem.js, chat/TurnTailNodeView.js | each copy holds its own module-level cache; one shared cache would reuse DOM elements across two render sites | keep both; review the cache design |
| dataDescriptor, defineEnumerableDataProperty, takeLast | packages/code-runtime/code-runtime-worker-thread/src/output-json.js, src/worker-json.js | both capture intrinsics at module load; moving them changes when the capture happens, which is security-relevant (docs/defensive-patterns.md) | review before any move |
| candidates, not verified: framework/hmr and client/hmr; session-telemetry-otel and host-product-telemetry-otel; packages/acp/acp and packages/examples/acp-demo | the named packages | names and descriptions only; behaviour not compared | compare in the fx stage |

### Not duplicates (kept on purpose)

- llm-deepseek and llm-pi-ai: alternative provider adapters behind one llm seam.
- tool-web and web-fetch-http: a model-facing tool over a seam, and the seam's provider.
- The passthrough stubs in rpc.schema.js, skills.schema.js and subagents.schema.js: different bodies, so they are not merged.

## Next stage (recorded, not started)

Stage 2: move the agent loop (core/agent-loop, the core/tools dispatch, guard) and the Cordis composition the agent needs onto fx's embedded txiki.

- Gate: fx's run_code witness passes.
- Prerequisites: txiki embedded in fx (none in its source now), and fx audit issue 1 closed or re-verified.
- Not started here: no loop or tool-dispatch change in this stage.

## Node-only uses in agent-side code and their adapter routes (Phase A)

Counted at e11df906, the commit before the adapter. Scope: packages/ and framework/ files that are not GUI-side (see the classification rule above). Each Node import, process member and Buffer use is listed below by file. Each one is now reached through @freddie/freddie-runtime/<subpath>; the subpath names are in packages/util/runtime/src.

| Count | Value |
|---|---|
| Files with a Node-only use | 180 |
| Node built-in import statements | 278 |
| process member uses | 144 |
| Buffer uses | 121 |

Built-in modules: node:path 66, node:crypto 42, node:fs/promises 40, node:fs 25, node:os 16, node:url 14, node:util 14, node:module 9, node:buffer 9, node:child_process 8, node:worker_threads 6, node:zlib 5, node:http 4, node:timers/promises 3, node:stream 3, node:vm 3, node:net 3, node:async_hooks 2, node:util/types 1, node:inspector 1, node:string_decoder 1, node:perf_hooks 1, node:dns/promises 1, node:https 1.

process members: env 37, platform 26, cwd 18, stderr 11, pid 9, execPath 6, stdout 5, kill 5, argv 4, stdin 4, exitCode 4, exit 4, send 2, execArgv 1, versions 1, loadEnvFile 1, connected 1, disconnect 1, on 1, prependListener 1, off 1, arch 1.

Buffer statics: .byteLength 34, .from 33, .alloc 28, .concat 15, .allocUnsafe 2, .isBuffer 1, plus instance methods on Buffer values.

Node-only uses that stay outside the adapter, each by design:

- apps/cli (the Node host): bin.js, dump-config.js, plugin.js, profile-boot.js keep direct node: imports and the global process. bin.js is the install point, and its first import is @freddie/freddie-runtime/install-node.
- GUI-side Node halves, 10 files, which serve the browser from the Node host: packages/client/connection/src/websocket-downlink.js, packages/client/css-manifest/src/index.js and scripts/generate-manifest.mjs, packages/client/file-upload/src/index.js, intake.js and staging.js, packages/client/hmr/src/index.js, packages/client/modules/src/index.js, packages/client/vendor-modules/src/index.js and scripts/generate-vendor.mjs. Their node: imports are unchanged.
- Worker entries, which run in a separate module graph and install the runtime themselves: packages/code-runtime/code-runtime-worker-thread/src/worker.js, packages/workflow/workflow-worker-thread/src/worker.js, packages/runtime-diagnostics/inspector/src/worker.js.
- Node-only globals not routed through the adapter: setImmediate in 3 files (packages/boot/app-boot/src/index.js, packages/code-runtime/code-runtime-worker-thread/src/index.js, packages/sdk/server/src/index.js), which txiki must provide or the callers must change. fetch and structuredClone are standard globals and are listed for the txiki check.

### Files

| File | Uses at e11df906 |
|---|---|
| framework/cordis/bin.js | modules: url; process: cwd x1 |
| framework/cosmokit/src/types.js | Buffer x8 |
| framework/hmr/src/error.js | modules: fs |
| framework/hmr/src/index.js | modules: path, fs-promises, url, module, async-hooks; process: argv x1 |
| framework/include/src/index.js | modules: path, fs-promises, timers-promises, url |
| framework/loader/src/index.js | process: env x2 |
| framework/loader/src/internal.js | modules: module; process: execArgv x1, versions x1 |
| framework/logger-console/src/index.js | modules: util |
| packages/acp/acp/src/content.js | Buffer x2 |
| packages/acp/acp/src/index.js | modules: crypto, path, stream; process: stdout x1, stdin x1 |
| packages/api/remote-stream/src/index.js | modules: crypto |
| packages/api/session-controller/src/commands.js | modules: crypto |
| packages/api/session-controller/src/list.js | modules: fs-promises |
| packages/api/terminal-controller/src/index.js | Buffer x1 |
| packages/api/terminal-controller/src/shells.js | process: platform x1 |
| packages/api/terminal-controller/src/stream.js | Buffer x1 |
| packages/api/workspace-files/src/index.js | modules: buffer; Buffer x1 |
| packages/attachment/attachment-local/src/index.js | modules: path |
| packages/attachment/attachment-local/src/request-image.js | modules: crypto, fs-promises, path |
| packages/attachment/attachment-local/src/store.js | modules: crypto, fs, fs-promises, path; process: platform x1 |
| packages/attachment/attachment/src/admission.js | modules: buffer; Buffer x1 |
| packages/boot/app-boot/src/index.js | modules: url, fs, util, path; process: cwd x3, stderr x3, loadEnvFile x1, env x2 |
| packages/boot/app-boot/src/profile.js | modules: module, fs, path |
| packages/boot/cmdline/src/index.js | process: stdout x1, stderr x1, stdin x1 |
| packages/boot/config-editor/src/index.js | modules: fs-promises, path, util |
| packages/bundle/headless/src/index.js | modules: crypto; process: stdout x1, stderr x1, cwd x1 |
| packages/bundle/web-app/src/index.js | modules: child-process, module, os, url; process: argv x1, platform x1, exitCode x2, execPath x1, stderr x1 |
| packages/code-runtime/code-runtime-worker-thread/src/bootstrap.js | modules: util |
| packages/code-runtime/code-runtime-worker-thread/src/index.js | modules: worker-threads, module, url |
| packages/code-runtime/code-runtime-worker-thread/src/output-json.js | Buffer x2 |
| packages/code-runtime/code-runtime-worker-thread/src/worker.js | modules: worker-threads; process: stdout x1, stderr x1 |
| packages/compaction/compaction-basic/src/region.js | modules: crypto, util |
| packages/context/agent-instructions/src/config.js | modules: path |
| packages/context/agent-instructions/src/digest.js | modules: crypto |
| packages/context/agent-instructions/src/files.js | modules: fs, fs-promises, path; Buffer x1 |
| packages/context/agent-instructions/src/index.js | modules: util; process: cwd x1 |
| packages/context/agent-instructions/src/render.js | modules: path; Buffer x2 |
| packages/context/agent-instructions/src/state.js | process: cwd x1 |
| packages/context/file-reference-local/src/index.js | process: cwd x1 |
| packages/context/file-reference-local/src/search.js | modules: fs-promises, path |
| packages/context/session-reference/src/projection.js | Buffer x6 |
| packages/context/session-reference/src/uri.js | Buffer x2 |
| packages/context/tmux-context/src/index.js | process: platform x1, env x1, pid x1 |
| packages/core/agent-loop/src/index.js | modules: crypto |
| packages/core/agent/src/index.js | modules: async-hooks, util-types |
| packages/core/session/src/index.js | modules: path |
| packages/credentials/credentials-local/src/index.js | modules: fs-promises, path; process: platform x1 |
| packages/examples/acp-demo/src/bin.js | modules: util; process: env x1, argv x1, stdin x1, exit x1 |
| packages/examples/acp-demo/src/index.js | modules: path |
| packages/experimental/agent-team/src/error.js | modules: util |
| packages/experimental/agent-team/src/mailbox.js | modules: crypto; Buffer x1 |
| packages/experimental/agent-team/src/roster.js | modules: crypto |
| packages/experimental/browser-use-browserskill/src/index.js | process: cwd x1 |
| packages/experimental/browser-use-chrome-devtools-mcp/src/index.js | modules: fs, path, url; process: execPath x1 |
| packages/extensions/cordis-host-runner/src/sandbox.js | modules: vm; Buffer x2 |
| packages/extensions/tool-cordis/src/api-catalog.js | Buffer x1 |
| packages/extensions/tool-cordis/src/prompt.js | Buffer x1 |
| packages/feedback/message-feedback/src/index.js | modules: buffer, crypto; Buffer x1 |
| packages/fs/fs-local/src/fsio.js | modules: crypto, fs, fs-promises, path, util; process: platform x2, pid x1; Buffer x2 |
| packages/fs/fs-local/src/index.js | modules: buffer, path, url; process: cwd x1; Buffer x1 |
| packages/fs/fs-local/src/win32.js | modules: path; Buffer x1 |
| packages/fs/fs-sandbox/src/containment.js | modules: fs-promises, path; process: platform x1 |
| packages/fs/tool-fs-search/src/glob.js | modules: path |
| packages/fs/tool-fs-search/src/presentation.js | Buffer x1 |
| packages/fs/tool-fs-search/src/search-core.js | modules: fs, path; process: execPath x1, cwd x1; Buffer x1 |
| packages/fs/tool-fs/src/read-image.js | modules: path |
| packages/fs/tool-fs/src/read-render.js | Buffer x1 |
| packages/fs/tool-str-replace-editor/src/index.js | modules: path |
| packages/goal/goal-round-driver/src/index.js | modules: util |
| packages/goal/goal-round-driver/src/invariant.js | modules: util |
| packages/goal/goal/src/index.js | modules: crypto |
| packages/host/apiproxy/src/api-proxy.js | modules: crypto, fs-promises, os, path; Buffer x3 |
| packages/host/apiproxy/src/fetch/handler.js | modules: crypto |
| packages/host/apiproxy/src/index.js | process: cwd x1 |
| packages/host/apiproxy/src/native-path-opener.js | modules: os, path; process: env x3, platform x2 |
| packages/host/directory-picker-auto/src/index.js | process: platform x1, env x2 |
| packages/host/directory-picker-auto/src/probe.js | modules: fs, path |
| packages/host/directory-picker-browse/src/index.js | modules: fs-promises, os, path; process: platform x1 |
| packages/host/directory-picker-native/src/native-picker.js | process: platform x1 |
| packages/host/directory-picker-native/src/win32-dialog-bindings.js | Buffer x4 |
| packages/host/directory-picker-native/src/win32-dialog-host.js | modules: child-process, url; process: execPath x1 |
| packages/host/directory-picker-native/src/win32-dialog-worker.js | process: env x1, send x2, connected x1, disconnect x1, on x1, exit x1 |
| packages/host/frontend-static/src/index.js | modules: fs-promises, path |
| packages/host/open-in-app/src/icons.js | modules: fs-promises, os, path |
| packages/host/open-in-app/src/index.js | modules: fs-promises, path; Buffer x1 |
| packages/host/open-in-app/src/resolver.js | modules: child-process, fs-promises, os, path; process: env x10 |
| packages/host/product-telemetry-otel/src/index.js | modules: module, http |
| packages/host/webserver/src/index.js | modules: http |
| packages/host/webserver/src/static-file.js | modules: fs-promises, crypto, util, zlib; Buffer x2 |
| packages/identity/anonymous-user-id/src/index.js | modules: crypto, fs, path; process: env x1 |
| packages/interaction/auto-review/src/index.js | Buffer x1 |
| packages/interaction/user-approval/src/index.js | modules: crypto |
| packages/llm/llm-deepseek/src/serialize.js | Buffer x1 |
| packages/llm/llm-deepseek/src/upload-index.js | modules: crypto, fs-promises, path |
| packages/llm/llm-pi-ai/src/auth.js | modules: os, fs-promises, path |
| packages/llm/llm-pi-ai/src/context.js | Buffer x2 |
| packages/llm/llm-retry/src/index.js | modules: crypto |
| packages/llm/llm/src/attribution.js | modules: module |
| packages/mcp/mcp-client/src/tools.js | modules: crypto, util; Buffer x1 |
| packages/preset/agent-presets/src/authoring.js | modules: fs-promises, path |
| packages/preset/agent-presets/src/discovery.js | modules: fs-promises, path |
| packages/preset/agent-presets/src/index.js | modules: fs-promises |
| packages/preset/agent-presets/src/metadata.js | modules: fs-promises, path |
| packages/preset/agent-presets/src/mount.js | modules: path, url |
| packages/runtime-diagnostics/inspector/src/cdp.js | modules: inspector |
| packages/runtime-diagnostics/inspector/src/index.js | modules: worker-threads |
| packages/runtime-diagnostics/inspector/src/worker.js | modules: crypto, http, worker-threads; process: exit x1 |
| packages/runtime-diagnostics/inspector/src/ws.js | modules: crypto; Buffer x17 |
| packages/sandbox/sandbox-local/src/index.js | modules: child-process, fs, os, path, url; process: platform x1, execPath x2 |
| packages/sandbox/sandbox-policy/src/index.js | modules: path; process: cwd x1 |
| packages/sandbox/sandbox-policy/src/runner-failure.js | modules: fs |
| packages/sandbox/sandbox-windows-acl/src/acl.js | modules: crypto, fs, path; Buffer x1 |
| packages/sandbox/sandbox-windows-acl/src/ffi.js | Buffer x2 |
| packages/sandbox/sandbox-windows-acl/src/index.js | modules: fs, path; process: cwd x1; Buffer x2 |
| packages/sandbox/sandbox-windows-acl/src/path-boundary.js | modules: fs, path |
| packages/sandbox/sandbox-windows-acl/src/runner.js | modules: fs, path; process: stderr x4, argv x1, exitCode x2 |
| packages/sandbox/sandbox-windows-acl/src/spawn.js | Buffer x3 |
| packages/sandbox/sandbox-windows-acl/src/token.js | process: pid x3; Buffer x4 |
| packages/sandbox/sandbox-windows-acl/src/workspace-sid.js | modules: crypto |
| packages/sandbox/sandbox/src/roots.js | modules: fs, os |
| packages/sdk/protocol/src/transport.js | modules: crypto, string-decoder |
| packages/sdk/server/src/index.js | process: stdin x1, stdout x1, exit x1 |
| packages/sdk/server/src/server.js | modules: path; process: cwd x1 |
| packages/session-query/session-query-sqlite/src/index.js | modules: crypto; Buffer x3 |
| packages/session-query/session-query-sqlite/src/schema.js | modules: fs-promises, path |
| packages/session/session-artifacts/src/index.js | modules: buffer, crypto; Buffer x2 |
| packages/session/session-persistence-jsonl/src/format.js | modules: path; Buffer x2 |
| packages/session/session-persistence-jsonl/src/index.js | modules: fs, fs-promises, path, perf-hooks, timers-promises, crypto; process: platform x1, pid x2, kill x1; Buffer x10 |
| packages/session/session-persistence-jsonl/src/win32.js | modules: fs-promises, path |
| packages/session/session-persistence-jsonl/src/zstd-private-decoder.js | modules: buffer, zlib; Buffer x4 |
| packages/session/session-persistence-jsonl/src/zstd-public-decoder.js | modules: zlib |
| packages/session/session-persistence-jsonl/src/zstd.js | modules: zlib, util |
| packages/session/session-telemetry-otel/src/index.js | modules: module |
| packages/session/session-title-llm/src/index.js | Buffer x1 |
| packages/session/session-title/src/normalize.js | Buffer x2 |
| packages/settings/settings-file/src/index.js | modules: fs-promises, path |
| packages/shell/bash-local/src/index.js | process: cwd x1 |
| packages/shell/pwsh-local/src/index.js | process: cwd x1 |
| packages/shell/pwsh-local/src/resolve.js | modules: fs, path; process: env x2, platform x1 |
| packages/shell/tool-bash-persistent/src/index.js | modules: crypto |
| packages/shell/tool-bash/src/index.js | modules: path |
| packages/shell/tool-pwsh-persistent/src/index.js | modules: crypto |
| packages/shell/tool-pwsh/src/index.js | modules: path |
| packages/skill/skill-badge/src/index.js | modules: fs-promises, url |
| packages/skill/skill-filesystem/src/index.js | modules: fs-promises, fs, path, os; process: env x2 |
| packages/skill/tool-skill/src/index.js | modules: crypto |
| packages/spill/spill-local/src/index.js | modules: path |
| packages/spill/spill-local/src/store.js | modules: crypto, fs, fs-promises, path, os; Buffer x1 |
| packages/spill/spill-policy/src/index.js | Buffer x4 |
| packages/storage/storage-json/src/atomic.js | modules: fs-promises, path, crypto; process: platform x1 |
| packages/storage/storage-json/src/index.js | modules: fs-promises, path |
| packages/storage/storage-json/src/unit.js | modules: fs-promises |
| packages/subagent/subagent-in-process-driver/src/index.js | modules: crypto |
| packages/subagent/subagent/src/continuation.js | modules: crypto |
| packages/subagent/subagent/src/lifecycle.js | modules: crypto |
| packages/subprocess/subprocess-local/src/index.js | modules: fs, fs-promises, path; process: prependListener x1, off x1, platform x3, cwd x1 |
| packages/subprocess/subprocess-local/src/process-inspector.js | modules: fs, child-process; process: kill x1, platform x1, arch x1; Buffer x1 |
| packages/subprocess/subprocess-local/src/spawn.js | modules: child-process, crypto, fs, os, path, timers-promises; process: platform x2, pid x1, kill x3; Buffer x2 |
| packages/subprocess/subprocess-local/src/terminal.js | modules: buffer, os, stream; process: platform x1; Buffer x1 |
| packages/subprocess/subprocess-local/src/windows-inspector.js | modules: child-process |
| packages/subprocess/subprocess/src/index.js | process: env x1 |
| packages/terminal/terminal-bash/src/sanitize.js | modules: buffer; Buffer x1 |
| packages/terminal/terminal-bash/src/session.js | modules: buffer; Buffer x3 |
| packages/typert/loader/src/index.js | modules: fs, module, path, url |
| packages/util/atomic-write/src/index.js | modules: crypto, fs-promises, path; process: pid x1 |
| packages/util/home-paths/src/index.js | modules: fs-promises, os, path; process: env x1 |
| packages/util/http-proxy/src/install.js | process: env x5 |
| packages/util/launch-environment/src/index.js | process: platform x1, env x1 |
| packages/util/native-command/src/index.js | modules: child-process |
| packages/web/web-fetch-http/src/address.js | modules: net |
| packages/web/web-fetch-http/src/network.js | modules: dns-promises, http, https, net, stream, zlib |
| packages/web/web-fetch-http/src/policy.js | modules: net |
| packages/web/web/src/index.js | process: env x2 |
| packages/workflow/workflow-worker-thread/src/host.js | modules: os, worker-threads, url; process: platform x1 |
| packages/workflow/workflow-worker-thread/src/index.js | modules: crypto, os, vm |
| packages/workflow/workflow-worker-thread/src/runtime.js | modules: vm |
| packages/workflow/workflow-worker-thread/src/worker.js | modules: worker-threads |
| packages/workspace/workspace/src/entity.js | modules: fs-promises |
| packages/workspace/workspace/src/index.js | modules: crypto, fs-promises, path |
| packages/workspace/workspace/src/paths.js | modules: fs-promises |


## txiki implementation of the runtime contract (Phase A)

packages/util/runtime/src/txiki.js is the second implementation of the contract. txikiRuntime has the same keys as nodeRuntime, and src/install-txiki.js installs it. It imports only tjs:path, tjs:ipaddr and tjs:utils, and it uses the tjs global and web globals (TextEncoder, TextDecoder, URL, atob, btoa, crypto, performance, MessageChannel, setTimeout). It imports no Node built-in.

Where txiki has no equivalent, the name is still exported, so the contract holds, and its value throws "@freddie/freddie-runtime: txiki.js has no <name>, see docs/fx-split.md (txiki gaps)" on use. A module object or default export that lacks a member throws the same way. Nothing falls back to Node.

| Area | Names that throw | Why txiki has no equivalent |
|---|---|---|
| fs (sync) | accessSync, closeSync, createReadStream, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, unwatchFile, watchFile, writeFileSync, writeSync | txiki file APIs are async only |
| fs.promises | opendir; access with a mode other than F_OK; writeFile with a flag other than w or with a mode; cp of a symbolic link | no Node Dir object; txiki writeFile has no append or mode option; link copy not defined |
| fs.constants | every name except F_OK, R_OK, W_OK, X_OK | the O_* flags have no txiki counterpart |
| crypto | createHash; randomBytes with a callback | tjs:hashing is excluded from the vendored build (needs mbedtls); Web Crypto digest is async-only |
| stream | Readable, Writable, PassThrough, pipeline | txiki has web streams only |
| buffer.constants | all members | not mapped |
| util | isDeepStrictEqual, parseArgs, parseEnv | no equivalent in txiki or the web platform |
| module | createRequire, stripTypeScriptTypes | txiki loads ES modules only |
| child_process | execFile, execFileSync, spawn, spawnSync | tjs.spawn exists, but its result is not Node's ChildProcess |
| os | networkInterfaces, platform, release, constants | tjs.system has no platform or release; platform is compile-time only (TJS__PLATFORM) |
| process | platform, arch, version, versions, exitCode, stdout, stderr, stdin, on, off, send, and every other member not in txiki.js | no JS-level platform; stdio is web streams; signals not mapped |
| worker_threads | Worker, parentPort, workerData | tjs.Worker is not Node's worker API |
| async_hooks | AsyncLocalStorage | txiki has no async context |
| vm | Script, createContext, runInContext | not mapped |
| http, https, zlib, inspector, dns/promises | all members | tjs.serve and tjs.lookup have other shapes; zlib is not mapped |
| timers/promises | setTimeout with an AbortSignal | not implemented |
| string_decoder | any encoding except utf8 | only utf8 is streamed |

Mapped without a gap: path (the tjs:path default object), url file-URL conversion (built on URL), util.promisify, util.TextDecoder, util.inspect (tjs:utils, so its output format differs from Node's), util.types.isPromise, perf_hooks.performance, timers/promises setTimeout and scheduler, crypto.randomUUID and randomBytes, net.isIP (tjs:ipaddr.isValid), os.homedir, os.tmpdir, os.availableParallelism, process.env, cwd, pid, ppid, execPath, argv, exit and kill, and a Buffer subset: from, alloc, allocUnsafe, concat, byteLength, compare, isBuffer, isView; toString for utf8, hex, base64, base64url, latin1, ascii and utf16le; equals, compare, copy, write, toJSON, slice as a view, and the UInt8, UInt16, UInt32, Int16, Int32, UIntLE and UIntBE accessors.

Behaviour that differs from Node and is kept on purpose: fs.promises.stat and lstat return Node-shaped Stats whose isX() methods wrap txiki's boolean flags, and whose time fields come from txiki's Date values. readFile returns a Buffer decoded from txiki's Uint8Array. process.env is tjs.env, and process.argv is [tjs.exePath, ...tjs.args]. Buffer.write does not avoid splitting a multi-byte character.

Assumptions Phase B must check against the real txiki: makeDir options, remove with recursive, writeFile(path, bytes), makeTempDir with a trailing XXXXXX template, ipaddr.isValid for IPv4 and IPv6 addresses, kill(pid, signal), and the contents of tjs.args.

The contract test lives in packages/util/runtime/test. contract-names.js lists 114 names across 25 subpaths, generated from the subpath files. contract-node.js installs the Node runtime and contract-txiki.js installs the txiki runtime; each checks every listed name. They run as node test/contract-node.js and tjs test/contract-txiki.js. The txiki entry needs no import map, because the subpaths use relative imports.
