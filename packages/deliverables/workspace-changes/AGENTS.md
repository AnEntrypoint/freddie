# @freddie/freddie-workspace-changes

## Rationale

- `git.js`: `GIT_CONFIG_COUNT: '0'` suffices for config isolation because the subprocess credential scrub already removes ambient `GIT_CONFIG_KEY_n` entries.
- `git add --ignore-errors` reports unreadable files through exit code 1 while the index is still complete, so that exit code is accepted (`UNREADABLE_FILES_EXIT_CODE`).
- `numstat.js`: only the first two tabs separate fields; a file name keeps its own tabs.
- `paths.js` `canonicalPath`: an unresolvable component is kept lexically under its nearest resolvable ancestor; a path whose only existing ancestor is the root keeps its spelling.
- `recorder.js`: an empty result after an earlier in-turn record supersedes that record (an empty first result records nothing). Ignored files are excluded from snapshot coverage, so captured paths that the snapshot does not cover are compared from their copies; nested repositories and submodules (gitlinks) never enter the summary.
- Per turn: git working-tree snapshots at turn start/end plus whole-file captures (content-addressed by SHA-1, in the Session temp dir) around each file-tool edit, so comparisons survive later edits without git.
- `workspace/changes` event carries only the turn number; summaries and comparisons are served by the `workspaceChanges` service until Session disposal (disposal removes the temp dir).
- Tool execution waits on pending recorder work so a snapshot/capture never races a mutation.
- No git or no repository: summary lists file-tool edits only.
- Capture kinds: absent, oversized (over byte cap, content not stored), file (stored copy). Oversized or binary sides list the file without counts and refuse comparison.
- Line comparison is timeout-bounded and degrades to whole-file replacement.
