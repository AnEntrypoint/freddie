# @freddie/freddie-workspace-changes

## Rationale

- `git.js`: `GIT_CONFIG_COUNT: '0'` suffices for config isolation because the subprocess credential scrub already removes ambient `GIT_CONFIG_KEY_n` entries.
- `git add --ignore-errors` reports unreadable files through exit code 1 while the index is still complete, so that exit code is accepted (`UNREADABLE_FILES_EXIT_CODE`).
- `numstat.js`: only the first two tabs separate fields; a file name keeps its own tabs.
- `paths.js` `canonicalPath`: an unresolvable component is kept lexically under its nearest resolvable ancestor; a path whose only existing ancestor is the root keeps its spelling.
- `recorder.js`: an empty result after an earlier in-turn record supersedes that record (an empty first result records nothing). Ignored files are excluded from snapshot coverage, so captured paths that the snapshot does not cover are compared from their copies; nested repositories and submodules (gitlinks) never enter the summary.
