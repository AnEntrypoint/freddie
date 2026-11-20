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
| fs (sync) | accessSync, closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync, writeSync | txiki file APIs are async only |
| fs.promises | access with a mode other than F_OK; writeFile with a flag other than w or a, or with a mode; cp of a symbolic link | no Node Dir object; txiki writeFile has no mode option; append is tjs.open with a; link copy not defined |
| fs.constants | every name except F_OK, R_OK, W_OK, X_OK | the O_* flags have no txiki counterpart |
| crypto | createHash for algorithms other than md5, sha1, sha256 and sha512 | done 2026-11-19 for those four in pure JS; tjs:hashing is excluded from the vendored build, so the rest stay gaps |
| stream | Readable, Writable, PassThrough, pipeline | done 2026-11-19 in pure JS, see the stream section |
| buffer.constants | all members | not mapped |
| module | createRequire, stripTypeScriptTypes | txiki loads ES modules only |
| child_process | execFileSync, spawnSync | execFile and spawn are implemented in pure JS over tjs.spawn (2026-11-19, see their sections); tjs.spawn is synchronous, so the sync forms of execFile and spawn need native blocking I/O |
| os | platform, release, constants | tjs.system has no platform or release; platform is compile-time only (TJS__PLATFORM) |
| process | platform, arch, version, versions, exitCode, stdout, stderr, stdin, on, off, send, and every other member not in txiki.js | no JS-level platform; stdio is web streams; signals not mapped |
| worker_threads | Worker, parentPort, workerData | tjs.Worker is not Node's worker API |
| async_hooks | AsyncLocalStorage | txiki has no async context |
| vm | Script, createContext, runInContext | not mapped |
| http (createServer), https, inspector, dns/promises | createServer and all other members | tjs.serve and tjs.lookup have other shapes; validateHeaderValue is implemented in pure JS |
| zlib | gzip | txiki CompressionStream and DecompressionStream throw "not a function" for every valid format in this build; gzip stays a gap, see the zlib section. gunzip is an owned pure-JS inflate (2026-11-19) |
| string_decoder | none | done 2026-11-19: every encoding Node accepts is decoded with Node's carry rules (see the string_decoder section) |

Mapped without a gap: path (the tjs:path default object), url file-URL conversion (built on URL), util.promisify, util.TextDecoder, util.inspect (tjs:utils, so its output format differs from Node's), util.types.isPromise, perf_hooks.performance, timers/promises setTimeout and scheduler, crypto.randomUUID and randomBytes, net.isIP (tjs:ipaddr.isValid), os.homedir, os.tmpdir, os.availableParallelism, process.env, cwd, pid, ppid, execPath, argv, exit and kill, and a Buffer subset: from, alloc, allocUnsafe, concat, byteLength, compare, isBuffer, isView; toString for utf8, hex, base64, base64url, latin1, ascii and utf16le; equals, compare, copy, write, toJSON, slice as a view, and the UInt8, UInt16, UInt32, Int16, Int32, UIntLE and UIntBE accessors.

Behaviour that differs from Node and is kept on purpose: fs.promises.stat and lstat return Node-shaped Stats whose isX() methods wrap txiki's boolean flags, and whose time fields come from txiki's Date values. readFile returns a Buffer decoded from txiki's Uint8Array. process.env is tjs.env, and process.argv is [tjs.exePath, ...tjs.args]. Buffer.write does not avoid splitting a multi-byte character.

Checked under gm's pinned txiki in Phase B: makeDir with recursive, remove with recursive, writeFile with a byte array, makeTempDir with an XXXXXX template, ipaddr.isValid for IPv4, IPv6 and non-addresses, and tjs.args (empty). kill(pid, signal) is not exercised. txiki's TextDecoder accepts only utf-8, so utf-16le is decoded in txiki.js.

Loader limit for fx: gm's run_code loader (native/components/quickjs/engine.cpp, load_module_from_disk) reads each import specifier as a literal path. It does not resolve package names or package exports subpaths. So the agent packages that import @freddie/freddie-runtime/* by name, and Cordis (which imports @freddie/cosmokit), cannot load there. Leaf agent modules with relative imports do load and run. fx's embedded loader must resolve package names and exports maps for the agent side to run as a package graph.

The contract test lives in packages/util/runtime/test. contract-names.js lists 114 names across 25 subpaths, generated from the subpath files. contract-node.js installs the Node runtime and contract-txiki.js installs the txiki runtime; each checks every listed name. They run as node test/contract-node.js and tjs test/contract-txiki.js. The txiki entry needs no import map, because the subpaths use relative imports. This host has no standalone tjs CLI; the txiki check ran inside gm's pinned txiki (run_code), which loads the same files.


## Open runtime items, ranked (2026-11-19)

Items that need no owner decision and no credential, ranked by how close each is to a verified result. Each row names what it needs before it counts as done.

| Rank | Item | Why this rank | Needed for a verified result |
|---|---|---|---|
| 1 | Behaviour parity for the implemented surface | Probes already matched Node under txiki; only the shared suite was missing | test/parity-cases.js run under Node and under txiki, with the gap cases throwing (done in this change) |
| 2 | util.isDeepStrictEqual and util.parseEnv in pure JS (done 2026-11-19: 91/91 parity under Node and txiki) | Node is the oracle; no host dependency | parity cases for equal, unequal, nested and cyclic values, and for quoted and multi-line env text |
| 3 | crypto.randomBytes with a callback; timers/promises setTimeout with an AbortSignal (done 2026-11-19: 98/98 parity under Node and txiki) | Small, and Node gives the expected result for each | parity cases for the callback order and for an abort rejecting with AbortError |
| 4 | fs.promises.opendir (done 2026-11-19: 102/102 parity under Node and txiki) | Needs a Dir with read, close and the async iterator | parity case that lists a scratch directory through the Dir and closes it |
| 5 | zlib.gzip and gunzip through CompressionStream and DecompressionStream | done 2026-11-19 for a round trip: zlib.gzip is a pure-JS stored-block encoder (no compression) and zlib.gunzip is pure JS. Byte parity with Node compressed output stays an open gap (see the stored-block section) | round-trip, header, trailer, empty and multi-block cases pass under Node and txiki |
| 6 | fs.promises.writeFile with flag a (done 2026-11-19: the 5 append cases pass under Node and txiki) | Needs FileHandle append semantics confirmed | parity case that appends and reads back |
| 7 | os.networkInterfaces (done 2026-11-19: 6 parity cases, Node and txiki agree) | txiki exposes a flat array, regrouped in pure JS | a probe of its shape, then a parity case against Node's shape |
| 8 | util.parseArgs (done 2026-11-19: 41 parity cases, Node and txiki agree) | Pure JS but a large option surface | parity cases for each option agent code uses, after a grep of call sites |

Needs an owner decision or fx, so not ranked: process.platform and os.platform (fx supplies the platform), sync fs (txiki has no sync file API), child_process (process model decision), stream classes (decided 2026-11-19, see the stream section), vm, worker_threads, AsyncLocalStorage, http, zlib brotli and zstd, and crypto.createHash (no equivalent or a dependency decision).

Found by the parity run: txiki's Buffer had a static isView that Node's Buffer does not have, so code that calls it would run under txiki and fail under Node. The suite cannot see extra members; the fix is in the Phase B commit.

Found by the parity run: gm's txiki loader does not resolve symlinks to one real path. Installing through the root link and importing the subpaths through packages/ produced two runtime.js instances, and only the installed one was seen. Entries must install and import through the same path. fx's loader needs realpath-equal module identity.

### Behaviour differences found in items 1 to 3 (2026-11-19)

- fs.promises.opendir returns a Dir built on tjs.readDir. txiki's directory iterator has no return(), so Dir.close only stops the Dir from reading; the native directory handle is released when the iterator is collected, not at close. Node releases it at close.
- txiki's readDir iterator returns undefined on a call after exhaustion instead of { done: true }. Dir records exhaustion and returns null from then on, so the iterator is never called past its end.
- crypto.randomBytes with a callback fills the bytes synchronously and calls back from a setTimeout(0) turn. Node calls back from its thread pool, so the ordering of the callback is the same but the timing is not.
- util.isDeepStrictEqual and util.parseEnv are pure-JS reimplementations of Node's semantics and grammar. They are checked by the 102 shared cases in test/parity-cases.js, not against Node's full test suite. Edge cases outside those cases (WeakMap, Proxy, getters with side effects, unusual dotenv quoting) are unverified.


## zlib gzip and gunzip under txiki (2026-11-19): gaps, decided

Decision (zlib.gunzip superseded 2026-11-19, see the gunzip section below; zlib.gzip superseded 2026-11-19, see the stored-block section): zlib.gzip and zlib.gunzip are gaps under txiki. They are not present names. Each throws the documented gap message when called: "@freddie/freddie-runtime: txiki.js has no zlib.gzip, see docs/fx-split.md (txiki gaps)", and the same with zlib.gunzip.

Reason: under gm's txiki, the CompressionStream and DecompressionStream globals exist but throw TypeError "not a function" for every valid format (gzip, deflate, deflate-raw). Only an unknown format is validated ("Unsupported compression format: 'bogus'"), so the native compressor behind valid formats is missing from this build. The txiki build source is not in this checkout, so the missing component is inferred from that symptom. A zlib implementation over these streams could only throw that error, so a gap states the actual state. Callers get the documented message instead of a raw TypeError.

Removed: the callback-form implementation added in 7f2e5983 (bytesOf, concatBytes, transformBytes, runCodec, gzip, gunzip). It stays in that commit's history and can be restored once the build provides a working compressor.

Contract: gunzip is a contract name, so the zlib list has 115 names in total. Under txiki the contract reports 115 names present, because a gap member is present by design. Of the 111 non-default names, 51 are gaps, zlib.gunzip is done and zlib.gzip is done in stored form (see the stored-block section); the count is re-measured there.

Parity: the five zlib cases in test/parity-cases.js (round trip, header bytes, trailer, empty input, bad input) keep their Node expectations and run under Node unchanged. Each carries a gap field. Under txiki each must throw the documented message for the named gap, and the runner counts it as gap-asserted rather than a value match. The bad-input case's Node expectation is Node's own message, "incorrect header check" (its code is Z_DATA_ERROR). The gap entries zlib.gzip and zlib.gunzip assert the same documented message directly.

What settles it: a txiki build with a working zlib backend. Then restore the implementation from 7f2e5983, remove the gap entries and the gap fields, and re-run both entries.

Not taken: a pure-JS deflate and inflate. That is an owner decision (an owned codec of several hundred lines, or a new dependency).


## os.networkInterfaces and util.parseArgs under txiki (2026-11-19)

os.networkInterfaces. tjs.system.networkInterfaces returns one flat array of { name, mac, address, netmask, internal }, with scopeId on IPv6 entries. It has no family or cidr and is not keyed by name. The txiki implementation regroups it into Node's shape: one array per interface name, in first-seen order, with address, netmask, family, mac, internal and cidr. family is IPv6 when the address contains a colon and IPv4 otherwise. cidr is the address plus the prefix length counted from the netmask; an IPv6 netmask is expanded from its :: form first. scopeid is set on IPv6 entries only, as Node does. The parity cases check the loopback entries, the key sets, mac, scopeid and grouping. They assume a Linux loopback named lo, which is what this suite runs on.

util.parseArgs. Implemented in pure JS in src/txiki.js for the common forms: short and long flags, values as the next argument or inline, combined short flags, attached short values, --no- negation under allowNegative (boolean options only), positionals, the -- terminator, multiple, defaults, strict and non-strict parsing, and tokens. Errors carry Node's codes and messages: unknown options (with the positional hint when positionals are allowed), unexpected positionals, missing values, ambiguous dash-values, and boolean options given a value. 41 shared parity cases cover these, and Node and txiki agree on all of them.

Gap: util.parseArgs without args. Node reads process.argv when args is omitted. txiki has no JS-level argv equal to Node's, so args is required, and omitting it throws the documented gap message (asserted in the gap cases).

Not covered: config validation of option definitions (the documented contract is trusted, not re-checked), and any parseArgs option beyond those listed above.


## Remaining txiki gap names, ranked by pure-JS feasibility (2026-11-19)

The 49 gap names are classified by what closing each would need. Only names that need no owner decision and no fx change are ranked. The rest are listed with the reason they are excluded.

Ranked (pure JS over the existing runtime):

| Rank | Name | Pure JS or native | Status |
|---|---|---|---|
| 1 | http.validateHeaderValue | pure JS: a regex check of the value (tab, 0x20-0x7e, 0x80-0xff allowed) and the two Node error codes | done 2026-11-19: 13 parity cases, Node and txiki agree |
| 2 | os.release | pure JS: read /proc/sys/kernel/osrelease once at module load (txiki reads are async, and os.release is synchronous), then return the cached value. Linux only; a missing file makes os.release the documented gap | done 2026-11-19 on Linux: 4 parity cases, Node and txiki agree; the non-Linux gap is asserted when active, which this Linux host never triggers |
| 3 | fs.watchFile and fs.unwatchFile | pure JS: stat polling over tjs.stat with timers; the listener receives current and previous stats as in Node. Verification needs timed file changes | done 2026-11-19: 5 timing-bounded parity cases, Node and txiki agree; see the watchFile section |

Excluded, with the reason:

- Sync fs (18 names: accessSync, closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync, writeSync): native. tjs file calls are all async, so blocking I/O needs a native change.
- fs.createReadStream, stream.Readable, stream.Writable, stream.PassThrough, stream.pipeline: done 2026-11-19 in pure JS (see the stream section).
- crypto.createHash: done 2026-11-19 for md5, sha1, sha256 and sha512, in an owned pure-JS implementation (see the ranked section below). Other algorithms are a declared gap.
- module.stripTypeScriptTypes: owner decision (needs a TypeScript parser, a dependency).
- module.createRequire: fx. It needs a CommonJS loader, which the txiki build does not provide.
- child-process.execFile and child-process.spawn: done 2026-11-19 (see their sections).
- os.platform: fx supplies the platform (excluded by the owner's direction).
- worker-threads.Worker: native. tjs.Worker is not Node's worker API.
- async-hooks.AsyncLocalStorage: native. txiki has no async context to propagate.
- vm.Script, vm.createContext, vm.runInContext: native or fx. They need a separate realm.
- http.createServer: owner decision. tjs.serve has a different shape, so the server API needs designing.
- zlib.gzip: stored-block gzip done 2026-11-19; compressed byte parity is still the owner decision. Its bytes differ from Node's deflate unless the algorithm is reproduced, so byte parity is the owner's call. zlib.gunzip is done (see the gunzip section).
- zlib.brotliCompress, zlib.zstdCompress, zlib.zstdDecompress, zlib.zstdDecompressSync, zlib.createZstdDecompress: owner decision and native. Brotli and zstd are not realistic in pure JS here.
- inspector.Session: native.

Counts before the stream change (2026-11-19): 21 fs names (18 sync, createReadStream, watchFile, unwatchFile), 1 crypto, 4 stream, 2 module, 4 child-process, 2 os, 1 worker-threads, 1 async-hooks, 3 vm, 2 http, 7 zlib, 1 inspector: 49.


## os.release under txiki (2026-11-19)

txiki's file reads are async and os.release is synchronous, so the release is read once when the txiki module loads (a top-level await of tjs.readFile on /proc/sys/kernel/osrelease, trailing newline removed) and os.release returns the cached string. A missing file (ENOENT, the error txiki gives on a non-Linux host) makes os.release the documented gap; any other read error is rethrown at load. The parity cases compare os.release with the file read through the runtime's fs-promises, and check its shape. The gap entry for os.release runs only when the gap is active (its applies predicate); on this Linux host it is inactive and is counted as such. The non-Linux branch has not been run on a non-Linux host.


## fs.watchFile and fs.unwatchFile under txiki (2026-11-19)

Node's watchFile fires its listener in two ways, and txiki now does the same. A file that exists at the first poll sets the baseline and is silent until a stat field changes. A path that is missing at the first poll fires once with zeroed stats for both curr and prev, and creating the file then fires with real current stats and zero previous stats. The fields compared for a change are dev, mode, nlink, uid, gid, ino, size, mtimeMs, ctimeMs and birthtimeMs; atime is not compared, as in libuv's poller.

Decisions:

- Missing paths are not an error. Node reports zeroed stats, not an error code, and txiki reports the same. ENOENT and ENOTDIR are the only stat errors read as missing; other stat errors reject the poll.
- Sub-millisecond timestamps: Node's mtimeMs carries fractional milliseconds, and tjs.stat gives Date values at millisecond resolution. The shared cases compare times through Date values and integer fields only, so no field is declared a gap. fs.stat already has this precision, so it is recorded here rather than asserted as a gap.
- watchFile returns undefined. Node returns a StatWatcher with ref and unref; txiki does not provide one.
- The interval is taken from the first watchFile call for a path, and the default is Node's 5007 ms.
- The txiki gap list drops fs.watchFile and fs.unwatchFile: 47 becomes 45.

The timing-based shared cases set a 20 ms interval, wait a bounded number of intervals before each change, and fail with a count message after 2000 ms if no event arrives. Each case removes its watcher in a finally block, so a failing case cannot keep the process alive.


## Remaining txiki gap names, ranked (2026-11-19, after crypto.createHash)

The 45 names still declared as gaps, ranked by how close each is to a verified pure-JS result over the existing runtime. Closeness means: a result we can check exactly against Node, with no native change and no decision left open. Each line says whether the work is pure JS or needs a native change; where a decision or fx is also needed, the line says so.

1. crypto.createHash: pure JS. md5, sha1, sha256 and sha512 are implemented and checked against Node. Other algorithms are a declared gap.
2. zlib.gunzip: pure JS. Done 2026-11-19: an owned inflate, checked exactly against Node fixtures (see the gunzip section).
3. zlib.gzip: pure JS deflate, but compressed bytes differ from Node's zlib unless the algorithm is reproduced. Only a round trip is verifiable, so byte parity needs a decision.
4. fs.createReadStream: done 2026-11-19 over tjs.open and FileHandle.read (see the stream section).
5. child-process.execFile: done 2026-11-19 (pure JS over tjs.spawn, see the execFile section).
6. child-process.spawn: done 2026-11-19 (pure JS over tjs.spawn; stdio streams stay gaps, see the spawn section).
7. stream.Readable: done 2026-11-19 (see the stream section).
8. stream.Writable: done 2026-11-19 (see the stream section).
9. stream.PassThrough: done 2026-11-19 (see the stream section).
10. stream.pipeline: done 2026-11-19 (see the stream section).
11. os.platform: pure JS, but excluded by the owner's direction (fx supplies the platform).
12. module.createRequire: needs a CommonJS loader, which is fx.
13. http.createServer: needs a request and response design over tjs.serve; owner decision.
14. module.stripTypeScriptTypes: needs a TypeScript parser (a dependency); not verifiable in pure JS here.
15. fs.accessSync: native (txiki file calls are async only).
16. fs.closeSync: native.
17. fs.existsSync: native.
18. fs.lstatSync: native.
19. fs.mkdirSync: native.
20. fs.mkdtempSync: native.
21. fs.openSync: native.
22. fs.readFileSync: native.
23. fs.readSync: native.
24. fs.readdirSync: native.
25. fs.readlinkSync: native.
26. fs.realpathSync: native.
27. fs.rmSync: native.
28. fs.statSync: native.
29. fs.symlinkSync: native.
30. fs.unlinkSync: native.
31. fs.writeFileSync: native.
32. fs.writeSync: native.
33. child-process.execFileSync: native (blocking).
34. child-process.spawnSync: native (blocking).
35. worker-threads.Worker: native.
36. async-hooks.AsyncLocalStorage: native (async context).
37. vm.Script: native (separate realm).
38. vm.createContext: native (separate realm).
39. vm.runInContext: native (separate realm).
40. zlib.brotliCompress: native.
41. zlib.createZstdDecompress: native.
42. zlib.zstdCompress: native.
43. zlib.zstdDecompress: native.
44. zlib.zstdDecompressSync: native.
45. inspector.Session: native.

Counts: 14 lines that are pure JS or need a decision, fx or dependency (1 to 14); 31 lines that need a native change (15 to 45).


## zlib gunzip under txiki (2026-11-19): pure-JS inflate

zlib.gunzip is a present name. src/txiki.js implements RFC 1951 inflate and RFC 1952 gzip framing in pure JS, with a CRC-32 check. Node is the oracle for every shared case in test/parity-cases.js:

- Fixtures are Node's gzipSync output: a stored block (level 0), a fixed-Huffman block (Z_FIXED), two dynamic-Huffman blocks (a skewed-word text of 800 and of 3000 words; the generator asserts BTYPE 2 for each), and a multi-member stream.
- Header flags: FNAME, and FEXTRA with FCOMMENT and FHCRC, are set by patching Node's bytes; the expectations are Node's gunzipSync output for the patched bytes.
- Malformed input: trailing garbage, a corrupt CRC, a corrupt length, a truncated stream, non-gzip bytes and empty input. Each expectation is Node's error code and message for the same bytes.
- Input types: strings, typed arrays and ArrayBuffer are accepted. Any other type throws synchronously with Node's "chunk" message. The callback is delivered after the synchronous code.

Decisions:

- Bytes after a member must start another gzip member, as in Node. Anything else raises "incorrect header check".
- Errors carry code and errno (Z_DATA_ERROR -3, Z_BUF_ERROR -5), as Node's do.
- Not checked against Node: the messages for other malformed streams (invalid block type, invalid distance, invalid code). They exist, but no fixture produces them, so they are unverified.
- zlib.gzip is a stored-block encoder since 2026-11-19 (see its section); compressed bytes still differ. Its bytes differ from Node's deflate, and the byte-parity decision stays with the owner.


## zlib.gzip byte parity: decided open (2026-11-19)

Decision (part superseded 2026-11-19): zlib.gzip is no longer a gap; its output is stored-block gzip. Compressed byte parity stays open, asserted in the gap check. Byte parity with Node's deflate is recorded as open, not closed.

Reason: Node's default output comes from zlib's deflate (lazy matching, hash chains, dynamic Huffman tree construction, block splitting). Reproducing its bytes exactly is a separate, large algorithm port, and no shipped caller needs it: the agent code paths that gzip only need a valid gzip stream. A round trip through Node's gunzip and the txiki gunzip verifies correctness without byte parity, so a partial implementation would add a surface that matches only some levels. Keeping the name a gap keeps the contract honest.

What would reopen it: a caller that depends on Node's exact compressed bytes (for example a stored checksum over gzipped output), or a decision to port zlib's deflate. Until then compressed byte parity stays open. The retired gap message was: "@freddie/freddie-runtime: txiki.js has no zlib.gzip, see docs/fx-split.md (txiki gaps)".


## child-process.execFile under txiki (2026-11-19)

execFile is a present name. src/txiki.js runs the command through tjs.spawn with stdout and stderr piped, waits for the exit, and then calls the callback with Node's (error, stdout, stderr) arguments. Node is the oracle for every shared case in test/parity-cases.js, and each expectation is Node's own output.

Decisions, each reversible, with its reason:

- Supported options: encoding and cwd (cwd: see the cwd section). Any other option key (env, timeout, maxBuffer, shell, stdio, signal, and the rest) throws synchronously with the documented gap message "txiki.js has no child-process.execFile option <key>". Reason: each needs a mapping onto tjs.spawn options that no test here verifies, and a silent ignore would change behaviour. cwd is asserted as a gap in the gap check.
- Encoding: the default is utf8 (strings). encoding 'buffer' or null returns a Buffer. Any other encoding decodes the bytes with that name. Reason: Node's own default.
- Return value: undefined. Node returns a ChildProcess with pid, kill and events. tjs.spawn is async, so no pid exists synchronously. Reason: the same precedent as watchFile's return value. This is a documented difference, not a gap case, because nothing can throw it.
- Callback: optional. It is called once, after the child exits, never synchronously. Without a callback the outcome is discarded. Reason: Node's signature.
- Exit failure: error.code is the exit status and error.signal is null. A termination by signal sets code to null and signal to the name txiki reports (it already gives the name, so no number map is needed). killed is false, because no timeout option exists. error.cmd is file and args joined with spaces. error.message is "Command failed: <cmd>" followed by a newline and the stderr text (utf8), as in Node.
- Missing command: error.code is ENOENT, error.message is "spawn <file> ENOENT", error.cmd as above. txiki's own message ("ENOENT: no such file or directory") is replaced, because Node's text is the contract and the cmd field is needed.
- Partial output: stdout and stderr are passed to the callback even when the command fails, as Node does.

Verified (Node oracle, all through the parity suite): stdout and stderr capture; nonzero exit; encoding buffer; SIGTERM; SIGKILL with partial stdout; empty command; missing command; callback ordering; callback omitted; the cwd gap. Not verified: stdin, large output, timing under load, and Windows. The gap check asserts the cwd gap message.

zlib.gzip byte parity remains open, as recorded in the zlib.gzip section above.


## child-process.spawn under txiki (2026-11-19)

spawn is a present name. src/txiki.js returns a ChildProcess over tjs.spawn. Node is the oracle for every shared case in test/parity-cases.js.

Finding that shaped the design: tjs.spawn is synchronous in this build. It returns the process at once, with pid, kill and wait, and it throws ENOENT synchronously for a missing command. So pid and kill work immediately, as Node's do, and no before-start gap is needed.

Decisions, each reversible, with its reason:

- Events are delivered asynchronously with setTimeout(0), as Node delivers them after the call returns. The order is spawn, then exit, then close. A missing command emits error (code ENOENT, message "spawn <file> ENOENT") and then close with code -2, as Node does. Reason: a listener attached after spawn() returns must still see every event.
- exit fires when the child exits, not at process exit. close fires after both stdout and stderr have ended; a stream with no consumer at exit is drained and its data discarded (see the stdout and stderr sections). Reason: the pipes are drained so a chatty child cannot block. Not verified against Node: a grandchild holding stderr open, which keeps close waiting.
- pid and kill(signal) are synchronous, as in Node. kill accepts signal names, returns true when the signal is sent and false once the child has exited or failed to start, and sets killed. A signal name txiki rejects with RangeError becomes the documented gap message "child-process.spawn kill with signal <name>". Node throws ERR_UNKNOWN_SIGNAL for an unknown name instead, so the messages differ; this path is not verified by a shared case.
- stdin getter throws the documented gap message. Not ported yet. stdout and stderr are Readables (see their sections).
- Options: cwd is supported (see the spawn cwd section). Any other option key throws synchronously with "child-process.spawn option <key>", as execFile does for the same reason (env, stdio and the rest need verified mappings).
- on and once are the only listener methods. Node's ChildProcess is a full EventEmitter; off, emit and the rest are not provided. Reason: no caller here needs them; adding them later is reversible.
- error with no listener throws, as Node does: the shared Emitter rethrows it (changed 2026-11-19 with the stream change).

Verified (Node oracle): exit code and close order; SIGTERM from kill after the spawn event, returning true and setting killed; missing command error and close; a numeric pid after the spawn event; kill before the spawn event returns true, as in Node; the gap cases for stdout, option cwd. Not verified: grandchild pipes, unknown signal names, and listeners that throw. Output content and end before close are verified through the stdout cases (see the stdout section).

## zlib.gzip as stored blocks under txiki (2026-11-19)

Decision: zlib.gzip is a pure-JS encoder that writes stored (uncompressed) deflate blocks, with the gzip header, CRC-32 and length trailer. zlib.gunzip (pure JS, earlier) decodes it. This reverses the earlier "zlib.gzip stays a gap" decision, and it keeps the byte-parity decision open.

Reason: a stored-block gzip is a valid gzip stream that Node and every inflater accept. It needs no compressor, so it does not depend on the missing txiki zlib backend. A stored-block output cannot match Node's compressed bytes, so the byte-parity gap stays declared in this section and in the open decision above; no parity case asserts those bytes.

Choices, each reversible:
- Blocks hold up to 65535 bytes. Empty input is one final block of length 0.
- The header is 10 bytes: magic, deflate, mtime 0, XFL 0, OS 3. Node writes the same header at its default level, so the header is a shared case.
- The trailer is CRC-32 and the input length modulo 2^32, little-endian. It is a shared case, including a length above 65535.
- Output size differs from Node for every input (stored blocks add five bytes each, and Node compresses). The empty-input case therefore checks the round trip, not the length of 20 bytes Node gives. That length expectation was removed from the shared cases.

Verified (Phase A, by reading the code; Node runs decide the rest): the five zlib cases that had a gap field lost it, so header, trailer and round trip are shared cases. Three cases are added: empty round trip, a 70000-byte round trip across two stored blocks, and a trailer of [112, 17, 1, 0] for length 70000.

Not matched or not verified: compressed bytes, Node's output length, and any input that Node's compressor treats differently. Byte parity remains the owner's decision.

Measured under gm's txiki (2026-11-19): the gap-name count is 40 (was 41), and the contract reports 115 present with nothing missing. Phase B witnesses are in docs/PENDING_VALIDATION.md.

## Streams under txiki: Readable, Writable, PassThrough, pipeline, fs.createReadStream (2026-11-19)

Decision: a pure-JS, Node-shaped stream module in src/txiki.js, built on one shared Emitter. Node 24 is the oracle for every shared stream case. The web-stream globals stay unused.

Reason: the smallest design that matches Node's observable event order for the cases verified under txiki. The probe (runs/analysis/stream-node.mjs, Node v24.22.0) fixed the order: writes call back before finish; end(cb) runs before the finish event; close comes last; a pipe ends the destination on the source's end; a pipeline calls back after the last stream closes; fs streams emit open, ready, 65536-byte data, end, then close.

Decisions, each reversible, with the reason:
- Default highWaterMark is 65536 (Node 24's value; verified: write(20000) returns true, push(20000) returns true, push(null) returns false). Any highWaterMark option is a gap, because custom watermarks change the return values and drain timing, and those are not verified.
- Options accepted: read (Readable), write and final (Writable), none (PassThrough), none (createReadStream). Any other key throws the gap message "<class> option <key>". Reason: an ignored option would hide a behaviour difference.
- Hooks: _read, _write, _final and _destroy, as in Node. Default _read and _write error with ERR_METHOD_NOT_IMPLEMENTED, as Node does.
- Gap methods (they throw the documented message): Readable read, setEncoding, unpipe, unshift, wrap; Writable cork, uncork, setDefaultEncoding; the EventEmitter methods off, removeListener, removeAllListeners, addListener, prependListener, listeners, eventNames on both classes. Reason: each is a separate API surface that is not verified.
- nextTick is emulated by a FIFO queue drained in a promise job. Reason: keeps the order between a stream's own events as in Node. Difference: its order against user promise callbacks may differ from Node's nextTick.
- data events carry Buffers (Node's default). A push while flowing with an empty buffer emits data synchronously, as Node does, and then schedules a read.
- Backpressure is not applied. write and push return Node's values, and drain is emitted, but pipe does not pause the source when write returns false. Reason: the pause and resume timing under backpressure is not verified; the shared cases never reach the watermark while piping.
- _read is called when the buffer is empty, not up to the watermark. Declared difference; the shared cases read in sequence and do not observe the call count.
- An error event with no listener throws, as Node does (the shared Emitter, also used by ChildProcess).
- fs.createReadStream: the open event carries FileHandle.fileno(). The ENOENT error is rebuilt in Node's format, "ENOENT: no such file or directory, open '<path>'", with errno -2, syscall open and path, because txiki's message has no path. Reads are 65536 bytes. At end of file the read's value is not a positive count (an empty chunk followed the last data in a debug run); the stream treats any non-positive count as end of file. The exact value was not captured.
- The stream destroy path waits for the open to finish before it closes the handle, so an early destroy does not leak a handle.

Verified under txiki (shared cases, Node expectations): sync and async writes with callback order; write after end (ERR_STREAM_WRITE_AFTER_END) order; write errors; sync and async pushes; pause before data; a pipe; PassThrough order and close; pipeline success and error; destroy with an error; the default _read error; push and write return values; createReadStream for a small file, a 150000-byte file in 65536-byte chunks, and a missing file. Gap cases: the options, the read, cork and off methods.

Not verified: non-string, non-Buffer chunks (TypeError); objectMode; writes after destroy; backpressure through pipe and drain timing; the readable event and read(); async iteration; error with no listener in a pipeline; reads and destroys during open; encodings other than utf8 for string chunks.

Measured under gm's txiki (Phase B witnesses in docs/PENDING_VALIDATION.md): the gap-name count is 35 (was 40); the contract reports 115 present with nothing missing.

## Reachable work, ranked (2026-11-19, after queue items 1 to 4)

Ranked by user-visible effect, then by how close each item is to a verified result. Reachable means no owner decision, no credential, no fx change and no native change. Each item names the probe that measures it.

1. pipe and write error paths (done in the previous stretch): a destination error or destroy makes write return false (so pipe pauses the source before end), a write after destroy calls back with ERR_STREAM_DESTROYED, a failed write calls back every queued write with the same error, and the destination's error listener is prepended so it unpipes the source. Done in this change (queue item 5): probes runs/analysis/pipe-error-node.mjs and writable-error-node.mjs, writable-destroy-queue-node.mjs; 7 new shared cases, all matching Node and txiki.
2. Readable public unpipe(dest) and unpipe(). Done (queue item 6): unpipe(dest) runs the pipe's internal removal, and unpipe() with no argument pauses once and then emits unpipe on each destination; Readable.unpipe is no longer a gap name. Probes runs/analysis/unpipe-node.mjs (5 cases) and pipe-error-node.mjs; 5 shared cases match Node and txiki.
3. cp of a link into its own subdirectory (ERR_FS_CP_EINVAL, ERR_FS_CP_SYMLINK_TO_SUBDIRECTORY) and the hard-link same-inode check. Done (queue item 7): tjs.stat returns ino and dev under gm's txiki (runs/analysis/stat-ino-body.js: a hard link reports the same ino and dev as its source), so the same-file check compares ino and dev, not realpaths. Node probes runs/analysis/cp-subdir-hardlink-node.mjs and cp-selfcases-node.mjs set the rules; 3 shared cases, matching Node and txiki. Divergence found while probing and fixed in the next stretch: a regular file copied onto an existing link replaces the link in Node (runs/analysis/cp-file-onto-link-repeat-node.mjs), and an overwrite unlinks the destination first, which keeps a hard-linked sibling (runs/analysis/cp-overwrite-hardlink-node.mjs).
4. Stream Emitter surface on Readable and Writable: addListener, prependListener, off, removeListener, removeAllListeners, listeners, eventNames, and the Readable readableFlowing getter. Done (queue item 9): probes runs/analysis/emitter-node.mjs and emitter2-node.mjs set the rules (addListener starts the flow like on; a once listener is unwrapped by listeners and removable by its function; removing the last readable listener resets flowing to null after a tick); 16 shared cases match Node and txiki.
5. Stream gap names, all reachable pure JS, none held. Done (queue item 10): Writable.cork, uncork and setDefaultEncoding (probe runs/analysis/stream-gaps-node.mjs; 9 cases), and Readable.setEncoding (same probe; 7 cases). Readable.unshift (probes runs/analysis/stream-gaps-node.mjs, stream-gaps2-node.mjs, stream-gaps3-node.mjs; 8 cases), and Readable.wrap (stream-gaps2-node.mjs, stream-gaps3-node.mjs, wrap-hwm-node.mjs; 9 cases). All six stream gap names are done; none is held. Not declared gaps and still missing: Writable.destroyed, writableLength, writableEnded and writableFinished (see the wrap section of PENDING_VALIDATION.md).

Held (each names the evidence that would reopen it):
- H1. fs.promises.access with R_OK, W_OK or X_OK. txiki has no access-with-mode call in its 52 members. Reopen: a tjs permission primitive, or a witness that a mode-bit check matches Node for owner, group and other under this host's uid.
- H2. fs.promises.writeFile with mode. Needs the process umask, which the 52 members do not expose. Reopen: a txiki umask read, or a witness of the masked creation mode.
- H3. zlib.gzip byte parity (open). Owner decision to port zlib's deflate. Reopen: that decision, or a caller that depends on Node's compressed bytes.
- H4. http.createServer (1 gap name). Owner decision on the server API; tjs.serve has another shape. Reopen: the owner's design for it.
- H5. os.platform (1 gap name) and the process members. Owner direction: fx supplies the platform. Reopen: fx platform decision.
- H6. module.createRequire (1 gap name). fx: needs a CommonJS loader the txiki build lacks. Reopen: a CommonJS loader in fx or txiki.
- H7. module.stripTypeScriptTypes (1 gap name). Needs a TypeScript parser, a dependency. Reopen: an approved dependency.
- H8. Sync fs (18 gap names) and child_process execFileSync and spawnSync (2). Native: the 52 tjs members have no sync variant. Reopen: a txiki build exposing a blocking file or spawn call.
- H9. zlib brotli and zstd (5 gap names). Native: CompressionStream throws "not a function" for valid formats. Reopen: a txiki build with a brotli or zstd backend.
- H10. vm (3), worker_threads.Worker (1), async_hooks.AsyncLocalStorage (1), inspector.Session (1). Native or fx: a separate realm, Node's Worker API, async context and inspector. Reopen: a txiki realm, worker, async-context or inspector API.

Gap-name count: 35 = H8 (20) + H9 (5) + H10 (6) + H4 (1) + H5 (1) + H6 (1) + H7 (1).

## child-process.spawn stdout under txiki (2026-11-19)

stdout is a Readable from the stream module, fed from tjs.spawn's stdout pipe by a pump that starts at spawn. Probe runs/analysis/child-stdout-node.mjs, run twice: only the exit and end order in one case differs between runs, so the cases assert order-independent facts (end before close, close last, exit code). Node measured (runs/analysis/child-stdout-node.out):

- a default read gives Buffer chunks, a Readable, the same object on each access, and end before close;
- 70000 bytes arrive whole, as Buffer chunks, with end before close;
- setEncoding('utf8') yields strings, and a multibyte character arrives intact;
- with no read, close still fires and the output is discarded; a stream attached after close gets nothing.

Design choices, each with its reason:

- The pump reads from spawn, so a consumer that attaches before exit receives all the data.
- Backpressure applies once a consumer exists; an unattached child is never blocked. Node does not block it either (the 70000-byte no-read case closes).
- close waits for the stdout stream to end when a consumer exists. When none exists at exit, the stream is resumed and drained, so close fires and the data is discarded, as Node does.

Not verified: destroy, pause and resume of the stdout stream while attached, the stdout close event, backpressure timing with a slow reader, and stdout after a spawn failure (ENOENT ends the stream at once; not compared with Node yet).


## Declared gaps outside the stream group, ranked (2026-11-19, after os.platform and process.platform)

Scope: the gap names declared in src/txiki.js (gapFunction, gapClass, and withGaps members that throw) and in the gap cases of test/parity-cases.js. The stream group is out of this ranking: the six stream names are done, and the stream options (Readable and Writable highWaterMark and objectMode, PassThrough highWaterMark) belong to it. Ranked by user-visible effect, then by how close each reachable item is to a verified result. Reachable means no owner decision, no credential, no fx change and no native change.

1. child-process.spawn stdout: done 2026-11-19 (see the stdout section).
2. child-process.spawn stderr: done 2026-11-19 (see the stderr section).
3. child-process option cwd: execFile done 2026-11-19 (see the cwd section); spawn done 2026-11-19 (see the spawn cwd section). exec is held: it is not a name in src/txiki.js or test/contract-names.js, so there is no function to add the option to. Reopen: a contract change adding exec.
4. util.parseArgs() with no args: held. Node's default is process.argv.slice(2). The txiki mapping process.argv = [exePath, ...tjs.args] has no script entry under gm-core: process.argv is [gm-core] with no user arguments (runs/analysis/parseargs-argv-txiki.out), so slice(2) and slice(1) both give [] and the probe cannot tell which one tjs.args needs. Re-probed 2026-11-19 with the launcher that adds arguments (runs/analysis/mcp-probe-extra-args.mjs): gm-core serve exits before initialize when extra arguments are given, with or without a -- separator, and tjs.args stays [] under serve. There is no standalone tjs binary on this machine. Reopen: a gm-core build that puts user arguments into tjs.args, or a standalone tjs binary to run a body with arguments.
5. fs.createReadStream option encoding: done 2026-11-19 (see the createReadStream section).
6. crypto.createHash: done 2026-11-19 for sha224, sha384, sha512-224, sha512-256, sha3-224, sha3-256, sha3-384, sha3-512, shake128, shake256, ripemd160, blake2b512 and blake2s256 (see the createHash and RIPEMD and BLAKE2 sections). Still a gap: options (shake outputLength and any other option key) throw the declared gap, reopen: an outputLength implementation for XOF names. md4 has no Node 24 oracle (ERR_OSSL_EVP_UNSUPPORTED).
7. child-process.spawn stdin: done 2026-11-19 (see the spawn stdin section). The stdin pipe is a ProcessWritableStream with getWriter.
7b. child-process option env (spawn and execFile): done 2026-11-19 (see the env section). The other option keys stay gaps: spawn accepts only cwd and env, execFile only encoding, cwd and env (timeout, maxBuffer, killSignal, shell, stdio, uid, gid, argv0, detached, windowsHide are each unprobed and need a verified tjs mapping).
7c. child-process options timeout and killSignal (spawn and execFile): done 2026-11-19 (see the timeout section). Signal names limited to the ten probed on txiki (SIGTERM, SIGKILL, SIGINT, SIGHUP, SIGUSR1, SIGUSR2, SIGQUIT, SIGALRM, SIGPIPE, SIGABRT); other names and numeric signals stay gaps. Remaining child-process keys stay gaps and are unprobed: stdio, shell, uid, gid, argv0, detached, windowsHide, maxBuffer. Reachable via a probe, but not taken.
7d. child-process option shell (spawn and execFile, boolean true or false only): done 2026-11-19 (see the shell section). Other shell values (a path string) stay a gap. Reachable and still open, in order: fs.promises.writeFile flag and mode (tjs.open takes wx, r+ and mode, probed); child-process uid and gid (accepted by txiki, same-uid probe needed, a different uid gives EPERM); child-process detached (accepted, session effect unprobed); child-process stdio 'inherit' (accepted, output routing unprobed); child-process maxBuffer, signal (AbortSignal exists), numeric killSignal (needs a number-to-name table), windowsHide (a no-op on Linux); crypto.createHash outputLength on non-XOF algorithms (unprobed); stream option highWaterMark, objectMode and encoding (unprobed); createReadStream options other than encoding (unprobed). Held: child-process argv0 (txiki ignores it, probed); fs.promises.access mode other than F_OK (tjs has no access, probed); fs sync family, execFileSync and spawnSync (tjs has no sync calls, probed).
7e. fs.promises.writeFile flag (wx, w+, wx+, a, ax, a+, ax+, r+) and mode (a number): done 2026-11-19 (see the writeFile section). Flags rs+, as, as+ and a string mode stay gaps (not verified). Still reachable and open, in order: child-process uid and gid (accepted by txiki, same-uid probe needed, a different uid gives EPERM); child-process detached (accepted, session effect unprobed); child-process stdio 'inherit' (accepted, output routing unprobed); child-process maxBuffer, signal (AbortSignal exists), numeric killSignal (needs a number-to-name table), windowsHide (a no-op on Linux); crypto.createHash outputLength on non-XOF algorithms (unprobed); stream options highWaterMark, objectMode and encoding (unprobed); createReadStream options other than encoding (unprobed). Held: child-process argv0 (txiki ignores it); fs.promises.access mode other than F_OK (tjs has no access); fs sync family, execFileSync and spawnSync (tjs has no sync calls).
7f. child-process options uid and gid (spawn and execFile, numbers only): done 2026-11-19 (see the uid section). A different uid or gid throws EPERM synchronously, as Node does. Non-number values stay gaps. Still open, in order: child-process detached and stdio (probed in the same stretch, see below); child-process maxBuffer, signal (AbortSignal exists), numeric killSignal (needs a number-to-name table), windowsHide (a no-op on Linux); crypto.createHash outputLength on non-XOF algorithms (unprobed); stream options highWaterMark, objectMode and encoding (unprobed); createReadStream options other than encoding (unprobed); writeFile flags rs+, as, as+ and string modes (unprobed). Held: child-process argv0 (txiki ignores it); fs.promises.access mode other than F_OK; fs sync family, execFileSync and spawnSync.
7g. child-process option detached: held (2026-11-19). txiki accepts it and ignores it (probed: the child stays in the parent's session); the setsid wrapper gives a session but changes the ENOENT error path. Reopen: tjs honouring detached natively, or an fx decision to accept the setsid wrapper with an explicit ENOENT check (see the detached section).
7h. child-process option stdio (spawn only): 'inherit' and arrays of 'pipe' and 'inherit' (three entries): done 2026-11-19 (see the stdio section). A string other than pipe or inherit ('ignore'), a short array, and execFile's stdio stay gaps. Still open, in order: child-process maxBuffer, signal (AbortSignal exists), numeric killSignal (needs a number-to-name table), windowsHide (a no-op on Linux); crypto.createHash outputLength on non-XOF algorithms (unprobed); stream options highWaterMark, objectMode and encoding (unprobed); createReadStream options other than encoding (unprobed); writeFile flags rs+, as, as+ and string modes (unprobed). Held: child-process argv0 (txiki ignores it); child-process detached (txiki ignores it, see 7g); fs.promises.access mode other than F_OK; fs sync family, execFileSync and spawnSync.
7i. os.platform and process.platform: done 2026-11-19, owner decision (derive from the runtime's real OS; nothing hard-coded). The value comes from uname -s, read once at module load and mapped through a fixed table of Node's names (Linux, Darwin, FreeBSD, OpenBSD, SunOS, AIX); an unknown name or a missing uname leaves the gap. Verified on Linux only (see the platform section).
7j. child-process.execFile maxBuffer: done 2026-11-19 (see the maxBuffer section). Stdout and stderr are read as streams and counted; past the limit the child is killed, the reader is cancelled, and the callback gets a RangeError with code ERR_CHILD_PROCESS_STDIO_MAXBUFFER and the output truncated to the limit. The default is 1 MiB, as in Node. A non-number or negative value stays a gap. spawn has no maxBuffer in Node, so spawn keeps its gap.
7k. child-process signal (AbortSignal) on execFile and spawn: done 2026-11-19 (see the signal section). A value without addEventListener stays a gap. Abort kills the child with killSignal; execFile reports AbortError (ABORT_ERR); spawn emits error then close. Already-aborted signals kill at once on spawn and are not started on execFile.
7l. child-process killSignal as a number: done 2026-11-19 on Linux (see the killSignal section). Numbers in the Linux table map to the ten names txiki accepts; any other number, and any number on a non-Linux host, stays a gap.
7m. child-process windowsHide: done 2026-11-19 as a no-op on Linux (see the windowsHide section). Boolean values are accepted on execFile and spawn and change nothing; any other value stays a gap.
7n. crypto.createHash outputLength on non-XOF algorithms: done 2026-11-19 (see the outputLength section). Equal to the digest size is accepted; any other value throws ERR_OSSL_EVP_NOT_XOF_OR_INVALID_LENGTH at createHash, as in Node. SHAKE (XOF) algorithms with outputLength stay a gap; a non-number value stays a gap.
7o. child-process stdio 'ignore' (spawn) and stdio on execFile: done 2026-11-19 (see the stdio ignore section). 'ignore' per slot leaves that stream null on the parent side; stdin and stderr become /dev/null in the child; stdout gives the child a socket, as Node does. execFile accepts a stdio key and ignores it, as Node does. Other stdio values stay a gap.
7p. stream options: highWaterMark on Readable, Writable and PassThrough (a per-stream limit read by push and write return values); objectMode on Writable (one count per object, default limit 16); encoding on Readable and PassThrough (sets the read side to strings). Done 2026-11-19 (see the stream options section). Objects in the read side: see 7s. highWaterMark errors: see 7t.
7q. fs.createReadStream options start, end and highWaterMark (inclusive end; chunk size = highWaterMark; start is reached by reading and discarding, because tjs file handles have no seek on this path). Done 2026-11-19 (see the createReadStream section). Still gapped: start or end that is negative or not a safe integer, end before start, highWaterMark 0 (non-integer highWaterMark errors are done, see 7t), and the other options (fd, autoClose, signal, mode, flags).
7r. fs.promises.writeFile flags rs+, as and as+ (the open flags tjs accepts; rs+ does not truncate); string modes for mode (octal digits, e.g. '0600'; other strings stay a gap). Done 2026-11-19 (see the writeFile section). Still gapped: other string modes and the rest of the writeFile options (encoding as a file option already handled; signal, flush).
7s. objectMode on Readable and PassThrough: objects in the read buffer (one count per object; read returns one object per call; default limit 16; PassThrough objectMode on both sides). Done 2026-11-20 (see the objectMode section). Still gapped: encoding together with objectMode, unshift with objectMode, and PassThrough back-pressure through an unread readable side (Node returns write false there; txiki's PassThrough calls its transform callback at once).
7t. highWaterMark that is negative, not an integer, or a string: ERR_INVALID_ARG_VALUE with Node's message ("The property 'options.highWaterMark' is invalid. Received -1"; PassThrough names options.readableHighWaterMark), for Readable, Writable, PassThrough and fs.createReadStream. Done 2026-11-20 (see the highWaterMark errors section). Still gapped: fs.createReadStream highWaterMark 0 and invalid start or end (Node throws ERR_OUT_OF_RANGE; txiki gaps).
7u. fs.createReadStream options signal (AbortSignal): an aborted signal emits an AbortError (ABORT_ERR) then close, and an abort during a read stops after the chunk in flight. Phase A: source and two shared witnesses (pending window run). Still open: options flags (r and r+ read; w gives EBADF and truncates; wx gives EEXIST), mode (a no-op on an existing file, kept 644), autoClose: false (data and end, no close: corrected, fd still open, see 7x), and a non-AbortSignal signal (ERR_INVALID_ARG_TYPE thrown synchronously; txiki gaps).
7v. fs.createReadStream options flags r, r+, w, wx: r and r+ read the file; w gives EBADF on read and truncates the file; wx on an existing file gives EEXIST and keeps it. Phase A: source (open with the flag; other flags stay gapped) and four shared witnesses; Phase B window runs them with red checks. Still open: flags other than r, r+, w, wx (for example a, a+, rs); mode (a no-op on an existing file, kept 644); autoClose: false (data and end, no close: corrected, fd still open, see 7x).
7w. fs.createReadStream option mode: accepted and ignored for an existing file (it stays as it was, 644 in the oracle). Phase A: src/txiki.js accepts 'mode' (no effect) and one shared witness 'fs.createReadStream mode 0o600 leaves an existing file unchanged'. Still open: mode values that Node rejects (not probed).
7x. fs.createReadStream option autoClose false: after end the stream does not destroy, so no close is emitted and the fd stays open; an open error (ENOENT) is emitted without a close. Phase A: src/txiki.js gates the end-path destroy (_afterEnd) and the open-error destroy on the option, and accepts a boolean. Two shared witnesses. Oracle: runs/analysis/createreadstream-autoclose-variants-node.out (no close after 1000 ms in either listener set) and the rerun of the earlier options probe, which still shows close, unexplained (see the autoClose section). Still open: autoClose values other than booleans (gapped), and the fd state (not observable through the parity harness).
7y. fs.createReadStream flag rs: sync read: the same bytes as r. Phase A: src/txiki.js accepts it (tjs.open takes the flag directly, probed on copies); one shared witness. Red check in Phase B: the flag removed from the accepted list.
7z. fs.createReadStream flag rs+: sync read and write: the same bytes as r+. Phase A: src/txiki.js accepts it (tjs.open takes the flag directly, probed on copies); one shared witness. Red check in Phase B: the flag removed from the accepted list.
7aa. fs.createReadStream flag w+: read and write, truncates the file: reads nothing and leaves the file empty. Phase A: src/txiki.js accepts it (tjs.open takes the flag directly, probed on copies); one shared witness. Red check in Phase B: the flag removed from the accepted list.
8. process.exitCode: held. The property is pure JS, but Node applies it at natural exit, and tjs exposes only exit(code) with no exit hook (runs/analysis/tjs-surface-body.js lists the members). Reopen: a txiki hook that runs when the event loop drains.
9. os.platform and process.platform: held by the owner's direction (fx supplies the platform). Reopen: the owner or fx providing it.
10. fs sync family (18 names) and child_process execFileSync and spawnSync: held, H8. Reopen: a blocking file or spawn call in txiki.
11. zlib brotli and zstd (5 names): held, H9. Reopen: a brotli or zstd backend in txiki.
12. vm (3 names), worker_threads.Worker, async_hooks.AsyncLocalStorage and inspector.Session: held, H10. Reopen: a separate-realm, worker, async-context or inspector API in txiki.
13. module.createRequire: held, fx (it needs a CommonJS loader). Reopen: fx providing one.
14. module.stripTypeScriptTypes: held, owner decision (a TypeScript parser is a dependency). Reopen: that decision.
15. http.createServer: held, H4 (owner decision on the server API). Reopen: the owner's design for it.

## child-process.spawn stderr under txiki (2026-11-19)

stderr is a Readable fed by the same pump as stdout, through the shared openPipe helper in src/txiki.js. Probe runs/analysis/child-stderr-node.mjs, run twice with identical output.

Does stderr match stdout? On every point the probe measured, yes: a default read gives Buffer chunks and end before close; 70000 bytes arrive whole; setEncoding('utf8') yields strings; a nonzero exit keeps the output; with no read, close fires and the output is discarded; a stream attached after close gets nothing; stdout and stderr stay separate; a read on one stream with the other unread still closes, and the unread stream's output is discarded. The stdout probe (runs/analysis/child-stdout-node.mjs) gives the same results, so no difference was found.

Not verified: stderr destroy, pause and resume while attached, the stderr close event, and stderr after a spawn failure (the ENOENT path uses the same closed pipe as stdout, not compared with Node).

## child-process.execFile option cwd under txiki (2026-11-19)

Probe runs/analysis/child-cwd-node.mjs, run twice with identical output. Node measured (runs/analysis/child-cwd-node.out):

- a cwd of '/' runs in that directory; a directory holding a marker file runs the command there; cwd '.' and an undefined cwd both run in the current directory;
- a missing directory reports through the callback as ENOENT, with message 'spawn sh ENOENT' and cmd 'sh -c pwd', and empty stdout and stderr;
- a cwd that names a file throws synchronously as ENOTDIR, with message 'spawn ENOTDIR' and syscall 'spawn', and the callback is never called.

Design, with reasons: tjs.spawn throws both errors synchronously (runs/analysis/spawn-cwd-errors-body.js: ENOENT and ENOTDIR for a missing directory and a file, and a valid cwd exits 0). execFile therefore starts the child synchronously. A missing command or directory (ENOENT) becomes the callback error as before. Other codes that Node also reports asynchronously (EACCES, EAGAIN, EMFILE, ENFILE, from Node's source, not probed) are delivered the same way. Any other code, such as ENOTDIR, throws synchronously with message 'spawn <code>' and syscall 'spawn'. Not carried over: errno numbers (Node gives -20 for ENOTDIR; txiki's error has no errno).

exec: held. There is no exec function in src/txiki.js and no exec name in test/contract-names.js, so the option has nothing to attach to. Reopen: a contract change that adds exec.

spawn cwd: still a gap, and reachable by the same option on tjs.spawn; it is not ported in this stretch.

## child-process.spawn option cwd under txiki (2026-11-19)

Probe runs/analysis/child-spawn-cwd-node.mjs, run twice with identical output. Node measured:

- cwd '/', a directory holding a marker file, '.', and an undefined cwd each run the command there, with spawn, exit and close events;
- a missing directory emits an 'error' event (code ENOENT, message 'spawn sh ENOENT', syscall 'spawn sh', path 'sh', spawnargs ['-c', 'pwd']) and then 'close' with code -2; there is no 'spawn' event, and pid is undefined;
- a cwd that names a file throws synchronously as ENOTDIR (message 'spawn ENOTDIR', syscall 'spawn').

Design: spawn and execFile share startProcess in src/txiki.js, so the two follow the same rules. ENOENT and the other asynchronous codes become an error object that carries Node's syscall, path and spawnargs, and the ChildProcess reports it through an error event followed by close -2 (no spawn event). Any other code throws synchronously. execFile adds cmd to its error object, which Node's execFile also has; spawn's error does not carry cmd.

Not verified: EACCES, EAGAIN, EMFILE and ENFILE (the asynchronous list comes from Node's source, not a probe); errno numbers; a missing directory that is reached through a symlink.

## fs.createReadStream option encoding under txiki (2026-11-19)

Probe runs/analysis/create-read-stream-encoding-node.mjs, run twice with identical output (the temporary directory in the error message is replaced by <dir>). Node measured:

- a string argument and an options object with encoding utf8 both yield string chunks, then end and close;
- a multibyte file read with utf8 yields strings with no replacement characters, split across several chunks;
- encoding hex yields hex text; no encoding and encoding null yield Buffer chunks;
- an empty file emits end and close with no data; a missing file emits an error (code ENOENT, syscall open) and then close;
- an unknown encoding throws synchronously as a TypeError with code ERR_INVALID_ARG_VALUE and the message "The argument 'encoding' is invalid encoding. Received '<name>'". The runtime's own encodingOf throws ERR_UNKNOWN_ENCODING, so createReadStream checks the name itself.

Design: createReadStream validates the encoding the way Node does, then calls setEncoding on the FileReadStream it already returns. Only the encoding key is accepted; start, end, highWaterMark and the rest still throw the gap error.

Not verified: base64 and latin1 as file encodings; start and end; a file descriptor argument; a symlinked path; the encoding of a stream that is paused and then resumed.

## fx split: crypto.createHash algorithms and options (2026-11-19)

Rank 6 of the ranked list in docs/fx-split.md. Probe: runs/analysis/create-hash-algorithms-node.mjs, run twice with identical output. It covers 21 names, the default digest length, and the empty, abc, 200-byte, non-ASCII, chunked and Buffer inputs.

Node measured: md5, sha1, sha224, sha256, sha384, sha512, sha512-224, sha512-256, sha3-224, sha3-256, sha3-384, sha3-512, shake128 and shake256 all hash. Their default lengths are 16, 20, 28, 32, 48, 64, 28, 32, 28, 32, 48, 64, 16, 32 respectively. ripemd160, blake2b512 and blake2s256 also hash in Node. md4 throws ERR_OSSL_EVP_UNSUPPORTED, and an unknown name throws "Digest method not supported". shake256 honours options.outputLength (an 8-byte request is the prefix of the 32-byte digest). sha256 with outputLength throws ERR_OSSL_EVP_NOT_XOF_OR_INVALID_LENGTH.

Design: sha256Digest and sha512Digest take an initial state and an output length. The SHA-224 and SHA-384 initial values are the FIPS 180-4 second-order and first-order bits of the square roots of the 9th to 16th primes. The SHA-512/224 and SHA-512/256 initial values are SHA-512 run over the label "SHA-512/t" from the SHA-512 IV XOR a5a5…. Keccak-f[1600] runs on BigInt lanes. Its round constants come from the rc LFSR and its rotation offsets from the (x, y) walk, both as FIPS 202 defines them. Each sha3 and shake name is a sponge with its rate, domain byte and output length. createHash throws the declared gap for any option key, so options.outputLength on shake is not silently ignored.

Found during the run: the first SHA-224 initial value used the first 32 bits of each root, not the second, so its 6 cases were red. It was fixed by shifting 128 instead of 64. The other three SHA-2 variants matched on the first run.

ripemd160, blake2b512 and blake2s256 were added later in the same stretch (see the RIPEMD and BLAKE2 section). Still gaps: shake outputLength and any other option key (declared gap, reopen: an outputLength implementation for XOF names, with a probe of the non-XOF rules). md4 is not produced by Node 24, so there is no oracle.

Not verified: shake with an output longer than the rate (more than 136 or 168 bytes, which needs more squeeze rounds); digests of inputs over one megabyte; the timing of Keccak on txiki.

## crypto.createHash: RIPEMD-160 and BLAKE2 under txiki (2026-11-19)

Probe: runs/analysis/create-hash-algorithms-node.mjs (the same probe as the createHash section; the exact-block input of 128 bytes was added, and the output was regenerated and checked twice). Node measured: ripemd160 with default length 20, blake2b512 with 64, blake2s256 with 32. Empty input: ripemd160 9c1185a5…, blake2b512 786a02f7…, blake2s256 69217a30…. The 128-byte input sits on a block boundary for all three: two blocks for RIPEMD-160 and BLAKE2s, one full block for BLAKE2b.

Design: RIPEMD-160 follows the 80-step two-line structure with the rho permutation, the (9i+5) right-line permutation, and the shift and constant tables. BLAKE2b is the 12-round compression on BigInt words with the SHA-512 IV, and BLAKE2s is the 10-round compression on 32-bit words with the SHA-256 IV. Both use the parameter block for an unkeyed digest of the requested length. The tables were checked against the Node output, and the empty-input values against the published test vectors.

Not verified: keyed BLAKE2 (createHash takes no key option, so keyed use is a declared option gap); the ripemd160 and rmd160 aliases; digests of inputs over one megabyte.

## child-process.spawn stdin under txiki (2026-11-19)

Probe runs/analysis/child-stdin-node.mjs, run twice with identical output (cat as the child). Node measured:

- a string write and end: stdout is the written text, exit 0, close with code 0 and no stdin error; the stdin is writable before end();
- two writes arrive in order ("ab"); an end with no writes gives empty stdout and exit 0;
- a binary chunk (0, 255, 16, 10) passes through unchanged;
- 300000 bytes in 3000 writes arrive whole, and the child exits 0;
- a write after end() emits an error with code ERR_STREAM_WRITE_AFTER_END, and the child still finishes with exit 0;
- a missing command: child.stdin is not null and is writable, a write produces no stdin error, the spawn error is ENOENT with syscall "spawn <file>", and close reports -2.

Design: spawn asks tjs for a stdin pipe. The stdin is a Writable whose writes go through the pipe's writer, whose end closes the writer, and whose destroy also closes it. The destroy is needed: a write after end destroys the stream, and without the close the child would never see EOF (the first run hung on exactly that). A failed start gets a Writable that accepts and discards writes, as Node does. The Writable class gains the writable getter, which is false once end() has been called, as in Node. execFile keeps its current options (no stdin pipe).

Not verified: the stdin error for a write into a child that has already exited (EPIPE); stdin destroy() called by the user before end; the stdin close event ordering relative to the child close event.

## child-process option env under txiki (2026-11-19)

Probe runs/analysis/child-env-node.mjs, run twice with identical output (the parent has HOME=/config and PATH). Node measured:

- env {FOO: 'bar'} replaces the environment: the child sees FOO; an env command prints only FOO=bar;
- env {} gives the child no HOME (the parent has one; a control without env prints it); the env command prints nothing;
- a number value becomes its string ("N=1"), a value with '=' and a space is kept whole, an undefined value is dropped, and a null value becomes the string "null";
- env with cwd together works ('/' then the value of FOO);
- execFile takes env the same way (FOO set; env {} gives no HOME).

Design: startProcess takes its options as one object (cwd, env, stdin) and passes env through processEnv, which drops undefined values and converts the rest with String. spawn and execFile both accept env; any other key is still the declared gap. tjs.spawn already replaces the environment with the env option, as Node does.

Not verified: env values that are objects, symbols or nested; env keys with '=' in them; env with PATH lookup of a bare command name (the cases use absolute paths); a null or non-object env argument.

## child-process timeout and killSignal under txiki (2026-11-19)

Reachability (before any implementation): tjs.kill accepts each of SIGTERM, SIGKILL, SIGINT, SIGHUP, SIGUSR1, SIGUSR2, SIGQUIT, SIGALRM, SIGPIPE and SIGABRT by name; a numeric signal and an unknown name both throw RangeError "Invalid signal specified". A setTimeout that calls kill ends the child with term_signal set to the named signal, and a timer cleared after a normal exit leaves exit 0 with no leftover process.

Node probe: runs/analysis/child-timeout-node.mjs (run twice, identical output). Measured: execFile timeout 300 with sleep 5 gives error {code null, signal SIGTERM, killed true, cmd 'sleep 5', message 'Command failed: sleep 5\n'}; killSignal SIGKILL and SIGINT set the matching signal; partial stdout 'hi' is kept on timeout; timeout 5000 not reached gives no error; timeout 0 disables the timer; spawn with timeout gives signal SIGTERM and killed true; killSignal SIGUSR1 gives signal SIGUSR1; spawn timeout 0 exits 0 with killed false.

Design: captureExecFile arms one timer when timeout > 0; the timer sets killed and calls the raw process kill with killSignal; the timer is cleared after wait. exitFailure takes killed. ChildProcess arms its timer in the constructor when options.timeout > 0 and clears it in #reap. spawn and execFile accept the two keys; killSignal must be one of the ten probed names, and timeout must be a non-negative number, otherwise a declared gap.

Not verified: fractional timeouts; a killSignal name outside the ten; numeric killSignal (Node accepts it, txiki rejects it); the orphan case (a shell killed by timeout leaves its sleep child running, as in Node's probe, and that behavior is not compared beyond the cases).

## child-process shell under txiki (2026-11-19)

Reachability (before any implementation): the wrapper /bin/sh -c "<file> <args joined by spaces>" run through tjs.spawn gives the same stdout and status as Node for echo, env expansion, argument joining, quotes and exit 3 (dev body inline; output matched the Node probe).

Node probe: runs/analysis/child-shell-node.mjs (run with --no-deprecation, twice, identical). Measured: execFile shell true runs the joined command through the shell; env expands; args join with spaces without quoting; quotes are kept; exit 3 gives code 3 and cmd 'exit 3'; shell false and the default run the file directly and give ENOENT with message 'spawn echo hi there ENOENT' and no killed key; spawn shell true expands env and joins args.

Design: shellArguments returns { file, argv } unchanged when shell is undefined or false, and otherwise { file: '/bin/sh', argv: ['-c', [file, ...argv].join(' ')] }. A value other than true or false throws the gap. spawn and execFile accept the key; both route through shellArguments.

Not verified: a path string as shell (gap); args containing spaces or shell metacharacters beyond the cases; the DEP0190 warning (Node warns when args are passed with shell true, which txiki does not emit; it goes to stderr and not to any case).

## fs.promises.writeFile flags and mode under txiki (2026-11-19)

Reachability (before any implementation): tjs.open(path, flag, mode) was probed on 21 operations (inline dev body, output in /tmp/wf-txiki.json). Results: wx and ax and wx+ on an existing file give EEXIST; r+ overwrites from the start without truncating and gives ENOENT on a missing file; a and a+ append; a new a/ax/ax+ creates; mode 0o600 is applied on creation for w, wx and a; a mode on an existing file is ignored; the default mode is 644 under umask 022.

Node probe: runs/analysis/write-flags-node.mjs (run with --no-deprecation, twice, identical output; umask 22 recorded in the output). Node gives the same results as the txiki probe for all 22 operations; the 23rd, ax+ on an existing file, is EEXIST on Node and is checked by the case file.

Design: writeFile validates the flag against WRITE_FILE_FLAGS = w, wx, w+, wx+, a, ax, a+, ax+, r+ (anything else is the gap), and the mode against the number type (default 0o666). Every flag goes through tjs.open(path, flag, mode) and a write loop, replacing the old tjs.writeFile path for w.

Not verified: flags rs+, as and as+ (Node accepts them; not probed, so gaps); string modes such as '0600' (gap); umask other than 022 (the default-mode cases are 644 only under 022).

## child-process uid and gid under txiki (2026-11-19)

Probe on txiki before implementation (inline body, /tmp/uid-txiki.json): running as uid 1000 and gid 1000 (the probe host's ids; read from id -u and id -g). uid 1000 and gid 1000 run and print 1000; no option runs as 1000; uid 1001 and gid 1001 throw EPERM synchronously from tjs.spawn.

Node probe: runs/analysis/child-uid-node.mjs (run twice, identical output). Node measured: spawn with uid and gid of our own ids runs and prints 1000; uid undefined runs as 1000; spawn with uid+1 or gid+1 throws EPERM synchronously (message 'spawn EPERM', syscall 'spawn', code EPERM); execFile does the same (EPERM thrown synchronously, not via the callback). Node and txiki agree on the sync throw, so no change to the async error classification.

Design: startProcess takes uid and gid and passes them to tjs.spawn when defined; spawn and execFile accept the keys; idOption checks each is a number (a string or other value stays a gap). The EPERM throw is the existing sync rethrow in startProcess (its message and code match Node).

Not verified: ids other than our own pair and the next id up (the root and other users are not exercised); gid lists (supplementary groups); a uid that is valid but has no password entry; the root case.

## child-process detached under txiki (2026-11-19)

Probe on txiki (inline body, /tmp/detached-stdio-txiki.json): tjs.spawn accepts detached: true, but the child stays in the parent's session (sid_is_pid no, pgrp_is_pid no, same_session yes). The option is accepted and ignored.

Node probe: runs/analysis/child-detached-stdio-node.mjs (run twice, identical output). Node: detached: true makes the child its own session leader and group leader (sid_is_pid yes, pgrp_is_pid yes, same_session no); without detached the child stays in the parent's session (same_session yes).

Workaround checked, not taken: wrapping the spawn in the setsid binary (present at /usr/bin/setsid) gives a session leader (sid_is_pid yes on txiki). It changes the error path: a missing file is reported by setsid (exit status), not by spawn ENOENT, so it is not a drop-in. Declared gap: spawn option detached (gap case). Reopen: tjs honouring detached natively, or an fx decision to accept the setsid wrapper with an explicit ENOENT pre-check.

Non-detached child session: the parity case checks that a child without detached stays in the parent's session (same on Node and txiki).

## child-process stdio under txiki (2026-11-19)

Probe on txiki (inline body, /tmp/detached-stdio-txiki.json): stdio 'inherit' on tjs.spawn gives child fd 0 and fd 1 that point at the same targets as the parent's (readlink of /proc/<parent>/fd/N; the parent's fds are pipe:[...]); arrays of pipe and inherit work the same way, and the piped slots come back as streams.

Node probe: runs/analysis/child-detached-stdio-node.mjs (run twice, identical output; run again with ROUTE=1 to see routing). Node: stdio 'inherit' gives child.stdin, child.stdout and child.stderr null, with the child's fd 0 and fd 1 equal to the parent's (exit 0); stdio ['pipe', 'inherit', 'pipe'] gives child.stdout null and the other two as streams, with fd 1 equal to the parent's.

Routing (recorded from the output): on Node, the child's echo line ends up in the probe process's own stdout (the output file contains 'inherited-line' from each inherit spawn). On txiki under mcp-probe, the child's fd 1 is gm-core's stdout pipe (pipe:[...], the same one gm-core writes its protocol to); mcp-probe reads that pipe as JSON-RPC and does not forward non-JSON text, so the child's echo does not reach the probe's output. The parity case therefore checks the fd targets and the exit status, not the text.

Design: startProcess takes a stdio triple and sets stdout and stderr (and stdin, when a stream is wanted) from it. spawn normalises stdio: a string 'pipe' or 'inherit' expands to three entries, an array must have three entries of those values; anything else is the gap. ChildProcess nulls the stream for an inherited slot, and #reap waits only on the piped streams. execFile keeps its own pipes and its key stays a gap.

Not verified: stdio 'ignore' (gap); the exact stdio behaviour of ENOENT with inherit (the failure path nulls the inherited slots, which matches Node only in the sense of null streams); reading from an inherited stdin.

## os.platform and process.platform under txiki (2026-11-19)

Probe on txiki (inline body, /tmp/platform-txiki.json): tjs has no platform property (its keys are listed in the probe file: no platform, no os name). Sources the runtime can read: /proc/sys/kernel/ostype reads 'Linux'; uname -s (spawned) reads 'Linux'; the process object has no platform key, so process.platform was a gap. The txiki process has no getuid-style call either, so the uname route was chosen: it names the kernel on Linux, Darwin on macOS, and the other Unix kernels, and needs no /proc.

Node probe: runs/analysis/platform-node.mjs (run twice, identical output): os.platform() = 'linux', process.platform = 'linux', os.type() = 'Linux', uname -s = 'Linux', and os.platform() === process.platform.

Design: a fixed table maps the uname name to Node's platform name (Linux to linux, Darwin to darwin, FreeBSD to freebsd, OpenBSD to openbsd, SunOS to sunos, AIX to aix). The name is read once at module load, as os.release is; os.platform returns it, and process.platform is set from it. Nothing else is hard-coded: the table is the translation from the kernel name to Node's names. A missing uname, or a name not in the table, leaves os.platform and process.platform as gaps.

Not verified: macOS (no macOS host here; the uname route is expected to give Darwin, which the table maps to darwin, but this is unmeasured); Windows (no uname; a gap); a host where uname prints a different name than the kernel (none seen).

## child-process.execFile maxBuffer under txiki (2026-11-19)

Probe on txiki (inline body, through mcp-probe): execFile with maxBuffer and the key check gap: every maxBuffer case threw the gap (the key check). Node probe: runs/analysis/five-node.mjs (deterministic, run twice; the maxBuffer cases are maxBufferFits, maxBufferExceeded, maxBufferLargeExceeded, defaultMaxBufferFits, defaultMaxBufferExceeded, maxBufferInfinity, maxBufferZeroExceeded). Node: a stdout over the limit gives RangeError with name RangeError, code ERR_CHILD_PROCESS_STDIO_MAXBUFFER, message 'stdout maxBuffer length exceeded', and stdout cut to the limit; the default is 1048576 bytes; Infinity never overflows; 0 overflows on the first byte.

Design: captureExecFile reads both streams through getReader and counts bytes. On overflow it kills the child with killSignal and cancels the reader, then returns the truncated bytes with the RangeError. Cancelling the reader is needed: without it a child that is still writing blocks on a full pipe, and the callback never fires (found while probing: 2 MB output with a 1000-byte limit hung on txiki; the same output with no limit read fine). The kill goes through signalChild, which ignores ESRCH: a child can be reaped by wait() while the reader is still running, and kill then throws Error with code ESRCH (probed).

Not verified: the signal the killed child reports (the error does not expose it, as in Node); Windows.

## child-process signal under txiki (2026-11-19)

Probe on txiki (through mcp-probe): every signal case threw the gap (the key check on execFile and spawn; an AbortSignal is accepted by neither). Node probe: runs/analysis/five-node.mjs (deterministic, run twice). Node: execFile with an already-aborted signal gives AbortError (name AbortError, code ABORT_ERR, message 'The operation was aborted') and empty stdout; execFile aborted 100 ms into exec sleep 5 gives the same error and empty stdout; spawn with an already-aborted signal emits error (AbortError, ABORT_ERR) then close (code null, signal SIGTERM); spawn aborted mid-run gives the same sequence.

Design: execFile registers an abort listener while the child runs; on abort it kills with killSignal and the callback gets abortError(signal) whatever the exit status. An already-aborted signal skips the spawn (no output, as Node shows). spawn registers the listener in the constructor: abort emits error and kills with killSignal; an already-aborted signal kills at once and emits error on the next timer, so close follows error. The listener is removed on reap.

Not verified: the case where the child ignores the kill (the execFile callback still returns on exit, since it waits for the child); Windows.

Mutation S2 (execFile aborts without killing) is not red: the callback still gets AbortError after the child finishes (5 s here); only the timing differs, which no case asserts.

## child-process killSignal as a number under txiki (2026-11-19)

Probe on txiki (through mcp-probe): numeric killSignal threw the gap (killSignalOf accepts only names). Node probe: runs/analysis/five-node.mjs (deterministic). Node: killSignal 9 gives signal SIGKILL, 2 gives SIGINT, 15 gives SIGTERM (execFile, timeout 100 ms, exec sleep 5); spawn with 9 closes with (null, SIGKILL); killSignal 9 and 'SIGKILL' give the same result.

Design: LINUX_SIGNAL_NUMBERS maps the Linux numbers (1, 2, 3, 6, 9, 10, 12, 13, 14, 15) to the names txiki accepts (the ten in KILL_SIGNALS). The map is used only when osPlatform is 'linux' (the value derived in the platform step). Any other number stays a gap, with the same gap message as before, which now names the value.

Not verified: non-Linux numbers (macOS and BSD numbers differ for SIGUSR1, SIGUSR2 and others; no such host here, so those stay gaps); ChildProcess.kill(number) (a separate gap, unchanged).

Mutation K3 (the platform guard removed) is not red: on this Linux host, the numbers map the same way with or without the guard, so the guard is not observable here.

## child-process windowsHide under txiki (2026-11-19)

Probe on txiki (through mcp-probe): windowsHide threw the gap on execFile and on spawn (the key checks). Node probe: runs/analysis/five-node.mjs (deterministic). Node: windowsHide true on spawn and execFile, and false on execFile, gives the same output as no option ('ok\n', exit 0). On Linux windowsHide has no effect (it hides a console window on Windows).

Design: the key is accepted on execFile and spawn; a windowsHideChecked validator accepts undefined or a boolean and gaps any other value. The value is not used: on Linux nothing depends on it, and txiki has no Windows target (uname gives no name there, so the platform stays a gap).

Not verified: Windows (no Windows host; the platform stays a gap, so windowsHide would not be reached there).

Mutation evidence and the regression numbers are in the PENDING_VALIDATION section for this step.

## crypto.createHash outputLength under txiki (2026-11-19)

Probe on txiki (through mcp-probe): outputLength threw the gap (option key). Node probe: runs/analysis/five-node.mjs (deterministic). Node: outputLength equal to the digest size (sha256 32, md5 16, sha512 64) gives the normal digest; sha256 with 16 throws Error with code ERR_OSSL_EVP_NOT_XOF_OR_INVALID_LENGTH and message 'error:030000B2:digital envelope routines::not XOF or invalid length' at createHash (not at digest); the same for any other length.

Design: createHash accepts the outputLength key. A number equal to the digest size of the algorithm (taken from the algorithm's own digest of an empty input, not a table) is accepted; any other number throws notXofError (the same code and message as Node). A shake* name with outputLength gaps, because SHAKE is an XOF in Node and accepts any length, which txiki does not implement; a non-number gaps.

Found by the txiki regression, not the dev body: shake256 (in txiki's hash table) with outputLength 8 threw the digest-length error, not the gap, because the first version of the check did not exclude XOFs. Fixed with the shake gap; the regression is clean after the fix.

Not verified: SHAKE with outputLength (gap); Node's behaviour for outputLength on other XOF names (none in txiki).

## child-process stdio 'ignore' under txiki (2026-11-19)

Probe on txiki (through mcp-probe; the raw tjs.spawn and the runtime wrapper): raw tjs.spawn with stdin 'ignore' and stderr 'ignore' gives fd 0 and fd 2 at /dev/null; with stdout 'ignore' the child's fd 1 is a socket (not /dev/null), and a 300000-byte flood to it exits 0 without blocking. The runtime wrapper gapped every stdio 'ignore' form and gapped execFile's stdio key.

Node probe: runs/analysis/stdioignore-node.mjs (run twice; differs only in socket inode numbers, which the cases normalise to socket:[N]): stdio 'ignore' leaves child.stdin, child.stdout and child.stderr null, exit 0; ['ignore','pipe','ignore'] gives fd 0 and fd 2 /dev/null; ['pipe','ignore','pipe'] gives fd 1 a socket; the 300000-byte flood exits 0. execFile ignores stdio: with 'ignore' it still captures 'hi\n'; with 'inherit' (runs/analysis/stdioinherit-execfile-node.mjs) it captures stdout 'hi\n' and stderr 'err\n' and does not print them.

Design: stdioOf accepts 'ignore' per slot; the ChildProcess null rule is now "any slot that is not a pipe" (the old inherit-only rule renamed noStdin, noStdout, noStderr); startProcess passes 'ignore' to tjs as-is. execFile takes the stdio key and does nothing with it, as Node does.

Not verified: whether the child can read from an ignored stdin (fd 0 is /dev/null, so a read gets EOF; checked by fd target only, not by a read); Windows.
