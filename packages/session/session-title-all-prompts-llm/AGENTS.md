# AGENTS.md — session-title-all-prompts-llm

## Rationale

- Each title provider exports its own `Config` schema with validators shared through `SessionTitleLlmConfigFields`. Cordis validates the runtime schema through `Config['~standard'].validate`; it does not statically walk source declarations.
