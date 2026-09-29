# AGENTS.md — code-runtime

## Rationale

- `PYTHON_KEYWORDS_AND_SOFT_KEYWORDS_BEYOND_ECMASCRIPT` includes the soft keywords `type` and `_` (and `match`): they are legal names in Python in practice, but they are reserved in `PORTABLE_RESERVED_WORDS` for safety so one namespace list stays valid on every backend.
