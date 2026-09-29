# AGENTS.md — code-runtime

## Rationale

- `PYTHON_KEYWORDS_AND_SOFT_KEYWORDS_BEYOND_ECMASCRIPT` includes the soft keywords `type` and `_` (and `match`): they are legal names in Python in practice, but they are reserved in `PORTABLE_RESERVED_WORDS` for safety so one namespace list stays valid on every backend.

## Comment-sweep notes (portable-identifier seam)
- Binding globals refused on every backend: `console`, `__dsh_main__`, `__builtins__`, `__name__`, `__debug__`. One shared set keeps namespace lists portable (CPython rejects assignment to `__debug__` at compile time, so an injected one is unusable).
- Error member names refused everywhere: JS `name`/`message`/`stack`, Python `args`/`with_traceback`/`add_note`, and every dunder form wholesale.
- Reserved words are ECMAScript union Python even though only the TypeScript worker ships; adding a language widens that union (breaking review of existing binding names).
- Program, budget, abort, and substrate failures resolve in the result's `error`; only Service Definition contract misuse rejects. `language`/`substrate` are informational, never gating.
- Rationale: .agents/notes/implemented/architecture/2026-07-31-code-runtime-portable-identifier-seam.md
