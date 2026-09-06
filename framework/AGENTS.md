# AGENTS.md — Framework Packages

This directory is the harness's own framework layer: the Cordis kernel, its loader/include/group/timer/hmr/logger-console plugins, and the cosmokit and schemastery foundation libraries. See `framework/README.md` for what each package is, what diverged from its upstream ancestor, and why.

**These packages are ours. Edit them directly, like anything under `packages/`.** They descend from upstream projects but are not synced from one: every package was rewritten from TypeScript to plain JavaScript, and the kernel and plugins carry this project's own lifecycle hardening, transactional config reconciliation, durable writes, and watching behavior. There is no sync procedure to follow and no upstream branch to rebase onto. A bug here is a bug to fix here.

Source is plain buildless `src/*.js` — no `tsconfig.json`, no `tsdown.config.ts`, no `lib/` output; `package.json` `main`/`exports` resolve straight to `src/index.js`. Keep it that way.

Two things to do when you change something here:

- If the code's shape would surprise a later reader (a deliberate departure from the obvious implementation, usually because the obvious one was tried and broke), add or extend an entry in `framework/README.md`'s divergence log. That log is the rationale record; it is why the reentrancy and ordering behavior in these packages is legible at all.
- Verify by booting a real composition that exercises the Loader/Include chain end to end, not by reading the source. The lifecycle behavior these packages guarantee is not visible in a static read.
