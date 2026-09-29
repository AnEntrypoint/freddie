# AGENTS.md — typert-registry

## Rationale

- `service.js` `configure`: the resolver map erases each merge-declared Wire type; the type is restored only at the typed `configure()` boundary so strict function variance remains sound.
