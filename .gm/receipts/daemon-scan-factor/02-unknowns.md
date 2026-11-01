# 02-unknowns: daemon-scan-factor
session: mcp-codemode-3535970-1793542718115-1-13

Each unknown recorded with mutable-add (unknown-add) under the same id.

- daemon-scan-factor-u1-daemon-source: which source file implements the spool scan (128-root scan, SPOOL_WORK_CACHE_TTL=200ms, active_projects). Candidates /config/tmp/gm-mcp-port/src, /config/tmp/fetch-fix/gm-mcp/src.
- daemon-scan-factor-u2-served-runner: is that source the one running for /workspace/freddie, and does it match the candidate copy?
- daemon-scan-factor-u3-baseline: does the before measurement reproduce now (5 spool git_status vs 5 direct git status --porcelain)?
- daemon-scan-factor-u4-idle-wait: does a dispatch written during an idle wait still complete, with side-effecting verbs not re-executed?
- daemon-scan-factor-u5-editable-file: the row names no file; the executor may edit only named files.

Open: 5. Next: gm-eliminate, each by a live JIT run with dispatch id.