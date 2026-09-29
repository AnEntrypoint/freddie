# AGENTS.md — jobs

## Rationale

- `src/index.js` `JobRegistry` constructor throws when `new.target === JobRegistry`: `abstract` erases at runtime, so a composition row naming this seam would register a `ctx.jobs` without methods and fail far from the misconfiguration.
