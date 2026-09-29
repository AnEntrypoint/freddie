# @freddie/freddie-agent-spine-demo

## Rationale

- Plugin order in the spine: `workspaceContext` registers before `toolSkill`. Both prepend session-prefix messages and registration order is the rendered order, so workspace instructions must precede the skill catalog.
- `toolOrder` is forwarded to `SystemPrompt` only when explicitly set; the owner schema resolves its own default.
- Executor-less, UI-less spine; deployments choose the LLM adapter, bash executor, presentation.
- Named exports only: Loader default unwrapping would discard the `Config` schema (docs/postmortem/0001).
- Plugin load order is irrelevant (cordis pends fibers on `inject`); the listing mirrors layering: LLM vocabulary and core registries, request/tool-wrapping extensions, then the loop.
- `agent-loop` gets `agents`; `system-prompt` gets `persona` and `toolOrder`; workspace-context gets its own forwarded config.
