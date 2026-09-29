# @freddie/freddie-agent-spine-demo

## Rationale

- Plugin order in the spine: `workspaceContext` registers before `toolSkill`. Both prepend session-prefix messages and registration order is the rendered order, so workspace instructions must precede the skill catalog.
- `toolOrder` is forwarded to `SystemPrompt` only when explicitly set; the owner schema resolves its own default.
