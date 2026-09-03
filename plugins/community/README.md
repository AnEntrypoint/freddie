# plugins/community/

Community tier: still auto-discovered and loaded by `discoverPlugins()` like
every other category (`core`, `gui`, `platform`, `memory`, `tools`, `security`,
`debug`) — nothing changes functionally by living here today.

What "community" means:

- No maintainer commitment. These integrations are not part of the actively
  maintained core surface.
- No witness/test coverage guarantee. They may have zero automated
  verification beyond `node --check` and a manual register-call smoke test.
- Contributions welcome, but expect less stability than `core`/`platform`/`gui`
  — breakage here is lower priority to fix than a core-tier regression.

This is a namespacing/documentation convention, not a loading-behavior change.
A future decision may gate this directory behind an opt-in env var so it stops
auto-loading by default; that gate does not exist yet, and adding one is out
of scope for the PRD row that created this directory (f20-niche-extract).

Current members: `spotify`, `google_meet`, `neutts_synth`, `rl_training`,
`mixture_of_agents`.
