# AGENTS.md — session-title-llm

## Rationale

- Provider-outage copy that gateways stream as a successful completion must never become a durable title. The Loader requires each provider plugin to export its own statically walkable schema (hence the `jscpd:ignore` blocks in the first-prompt and all-prompts providers); field validators stay shared. Messages are framed as JSON so user text cannot break delimiters.
