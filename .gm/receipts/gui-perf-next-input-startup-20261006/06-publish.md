# 06-publish: gui-perf-next-input-startup-20261006
session: mcp-codemode-3535970-1793542718115-1-16

## step 1 pull
git_pull refused: dirty_worktree (other lanes' tracked paths under .gm/ and framework/). Nothing fetched or merged. Local HEAD 66b4cd3f is 3 ahead, 3 behind origin/main f7dc65f5.

## step 2 publish (shared-tree Git API route)
Local git_finalize was not used: the tree is shared and dirty. Published via the Git API (gm-orchestrate, Shared-tree publish):
- base: remote main f7dc65f53c417517b189a52dbb0cb4f6a1dae6cd (its blobs for framework/webjsx/src/attributes.js and framework/README.md equal local HEAD, so the edit applies cleanly).
- commit: a4cd7c5ce2c43b4cfb3042d840a86f6363b3c52a, parent f7dc65f5, author lanmower, no trailers.
- files (7): framework/webjsx/src/attributes.js, framework/README.md, .gm/prd/gui-perf-next-input-startup-20261006.yml, .gm/receipts/gui-perf-next-input-startup-20261006/{01-orient,02-unknowns,03-eliminate,04-edit}.md.
- refs/heads/main PATCHed with force unset; every path re-read at ?ref=main and blob sha matched.
- driver: /tmp/gui-perf-20261006/publish.mjs (outside the repo).

Local tree: our 7 paths already match remote main. Local HEAD is behind by this commit plus the 3 remote commits; a later pull by its owning lane will reconcile.

## step 3 handoff
STATUS: handoff a4cd7c5ce2c43b4cfb3042d840a86f6363b3c52a

## CI
Not read here. The CI lane (ci-status on a4cd7c5c) is spawned by the orchestrator.

## friction (for the gm agent)
1. pnpm install on this host left @img/sharp-libvips-linux-x64@1.3.2 unmaterialised (empty dir under node_modules/.pnpm, "Already up to date" even with --force). The web entry then fails with libvips-cpp.so.8.18.3 missing. Repaired by extracting the registry tarball into that dir. Install should fail loud or materialise optional native deps.
2. git_pull refuses on a shared dirty tree even when the executor's paths are clean; a publish path that does not need a fetch would avoid the Git API detour.
3. gm served bundle 0.2.380 vs installed 0.2.382 (bundle_stale); restart of the MCP client needed.
4. prd-add rescope returned a reference-search prompt for this row; not run (outside this lane's stages).
