---
key: mem-f3c5fb7a7e12e9bc-953
ns: default
created: 1788729466985
updated: 1788729466985
---

## Resolved mutable: native-gm-tool-postcondition

postcondition discharged live against THIS session transcript, not stale session-41730140. Decompressed ~/.freddie/sessions/--C-dev-deepseek-harness--/session-b883a0dd-7537-4905-b82a-0225b9a951ba/session.jsonl.zstd (106 zstd frames, 361 events, 45 tool/call). tool/call names: skill=1 pwsh=4 mcp__gm__gm=29 read=11. Native gm verbs used: instruction, phase-status, exec_js, scan_deps, codesearch, git_status, git_show, git_diff, mutable-resolve -- all via mcp__gm__gm. The 4 pwsh bodies are: (1) gm-skill boot probe reading .status.json/.turn-summary.json, (2) ConvertFrom-Json of an already-written instruction OUT file, (3) FREDDIE_* env + port inventory, (4) ConvertFrom-Json of an exec_js OUT file. None write .gm/exec-spool/in/<verb>. The 4 transcript lines matching exec-spool/in are request/header (system prompt), skill-load result, instruction result, and mutables.yml read -- not pwsh writes.
