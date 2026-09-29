# AGENTS.md — code-language

## Rationale

- Persisted extension-to-language table: the two JSX flavors (`tsx`, `jsx`) keep their own suffix; every other persisted value is the language's short name, or an extension naming itself better than its language does (`tf` rather than `hcl`, `gradle` rather than `groovy`).
