# AGENTS.md — home-paths

## Rationale

- Ancestor probe: a Windows file-as-parent probe reports `ENOENT`, so the resolved ancestor is opened with `opendir` to preserve the cross-platform directory requirement.
