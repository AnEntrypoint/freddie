# AGENTS.md — Examples

Runnable harness compositions. `examples/` is one workspace member and the module-resolution root for runnable Cordis configs; it is not a build target. [package.json](package.json) declares the packages loaded by those configs, while each leaf's private `package.json` remains metadata only.

Extract reusable logic into `packages/`. Examples keep only `cordis.yml` wiring and demo artifacts; app package bins own boot glue.

## Verification

Verify each example live: boot its real `cordis.yml` through the Loader, drive it with a real or scripted prompt, and read the real output and exit code. A with-key run against a live model verifies external state, not the model's own claim about what it did.

In `cordis.yml`, comment only non-obvious wiring, load-order consequences, replay, security boundaries, and configuration scope. Do not narrate visible entries; use [freddie-prose-standard](../.agents/skills/freddie-prose-standard/SKILL.md) for required coverage and editorial judgment.

See [the root AGENTS.md](../AGENTS.md) for repo-wide conventions and [docs/architecture.md](../docs/architecture.md) for the design.
