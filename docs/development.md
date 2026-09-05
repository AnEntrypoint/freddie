# Development guide

The setup tutorial takes a new contributor from prerequisites to a checked checkout. The contributor reference that follows covers repository layout, daily workflow, and CI organization. Design rationale and implementation details belong to the linked Agent Notes and scripts.

## Setup tutorial

### Prerequisites

- Node.js supports 22.19+ and 24+. CI covers 22.19, 24, and 26; see the [Node engine floor Agent Note](../.agents/notes/implemented/process/2026-07-06-node-engine-floor.md).
- Corepack-enabled pnpm. The repo pins `pnpm@11.7.0` in `package.json`; run `corepack enable` if `pnpm --version` does not resolve through Corepack.
- Optional: a DeepSeek API key for the Web, headless, and ACP automation demos and real-API e2e tests.

### First-time setup

Install dependencies from the repo root:

```sh
pnpm install
```

Setup is complete after `pnpm install`. There is no build or typecheck step to run — `pnpm freddie web` boots directly from source.

## Contributor reference

### Package layout

The repository is buildless plain JavaScript (ESM, `"type": "module"`). Every workspace package ships `src/**/*.js` directly; there is no TypeScript compilation, no bundling, and no generated `lib/` output. `packages/*/*/src` runs directly under plain `node`, with local relative imports using `.js` specifiers. Business services declare callable methods with `@Remote` or `@RemoteScope`; see [API Gateway](api-gateway.md) for how those Host/Client contracts are wired at runtime rather than generated at build time.

`pnpm run publint` (`scripts/publint-all.js`) is the one real pre-publish check: it walks each package's real relative imports and asserts every imported file is listed in that package's own `package.json` `"files"` array, so a package cannot publish source that references a file it doesn't ship.

### Environment variables

The real DeepSeek adapter and key-backed agent demos read credentials from the environment or from a gitignored `.env` at the repo root:

```sh
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://... # optional
```

`DEEPSEEK_BASE_URL` is optional and defaults to the public API. Never commit real credentials. The real-API e2e suites self-skip when `DEEPSEEK_API_KEY` is not set.

### Git integrations

No local git hooks are installed. Contributors run the [checks relevant to the changed behavior](../AGENTS.md#verify-before-pushing) once; CI, where present, owns exhaustive coverage.

### Daily commands

The root [contributor instructions](../AGENTS.md#commands) summarize common commands; [`package.json`](../package.json) owns the current script inventory. Select the smallest checks that cover the changed surface — `pnpm run publint` for package-shape/publish-surface drift, a live boot for behavior changes.

### Demos

The one-shot Headless coding agent needs `DEEPSEEK_API_KEY` in the environment or repo-root `.env`:

```sh
pnpm freddie --profile headless "summarize this workspace"
```

The self-referential cordis demo can inspect and modify its live plugin runtime and needs the same credentials (`web` by default, or `acp`):

```sh
pnpm run demo:cordis
```

The ACP automation server exposes fresh agent sessions over JSON-RPC stdio and also needs `DEEPSEEK_API_KEY`:

```sh
pnpm run demo:acp
```

### TODO markers

Use one of three comment tags to flag known issues in the code, ordered by urgency:

- `FIXME` — an issue that should block a new release. A release should not ship with an open `FIXME` unless reviewers explicitly agree the change can be merged anyway.
- `TODO` — an issue that should be fixed soon, once we have the resources.
- `XXX` — an issue that we may fix someday; lowest priority, no commitment.

Pick the tag that matches the urgency so anyone scanning the code can tell a release blocker from a someday-maybe.

### Documenting types verbatim (`ts type-equiv`)

The [subsystems](subsystems/README.md) pages paste source-equivalent declarations together with their original JSDoc so a reader sees the exact type definition and source contract. To keep a paste from drifting when source changes, fence it as ` ```ts type-equiv ` (instead of ` ```ts `) and register it in `scripts/type-equiv.manifest.json` with the source file and symbol it mirrors:

```json
{ "doc": "docs/subsystems/session.md", "symbol": "SessionEvent", "source": "packages/core/session/src/types.ts" }
```

For a class whose implementation bodies do not belong in the catalog, use ` ```ts public-api ` and set `"projection": "public-api"`; the checked projection retains the public fields, constructor, accessors, methods, and original class/member JSDoc while omitting bodies and private or protected members. When you change a documented declaration or its JSDoc, update the matching paste by hand; when you add or remove a block, update the manifest in the same change.

There is no automated verifier for this manifest currently wired up — treat the subsystem pages and `scripts/type-equiv.manifest.json` as a manually maintained correspondence until one exists.
