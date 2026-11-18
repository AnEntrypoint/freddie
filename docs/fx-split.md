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
