# Agent Note: Drop the VitePress documentation site and bilingual English/Chinese docs

Status: implemented

## Problem

This repo previously shipped a VitePress documentation website (`website/`, `website/docs.ts`, `scripts/project-doc-site.ts`) that projected canonical Markdown into a public site, plus a full bilingual English/Chinese documentation pipeline: paired sibling files (`foo.md` + `foo.zh.md` + `foo.i18n.yaml`), a pairing gate (`verify-translation-pairing`), a calibrated translation prompt contract, a merge driver for pairing records, a briefed minimal-update workflow, and a manual `dsh-translate-docs` skill. Fourteen Agent Notes recorded this system as shipped, present-tense reality.

The repo no longer has a `website/` directory, no `docs/i18n/` directory, and no `.zh.md`/`.i18n.yaml` files anywhere — confirmed nothing in `scripts/` or elsewhere still consumes them. The whole system is gone. This note replaces the 14 source notes below, consolidating them per the [Agent Note consolidation rule](../../README.md) ("An implemented Agent Note that is fully superseded may be consolidated into the current owning note and deleted") — the source notes described implementation detail of code that no longer exists, which is not itself future-relevant, but each was checked for any genuinely reusable rationale that would inform a future re-introduction of docs tooling or bilingual support.

## Decision

The VitePress documentation site and the entire bilingual/Chinese documentation pairing system are removed. Documentation in this repo is English-only, with no publication pipeline separate from the repository itself (GitHub renders canonical Markdown directly). No pairing gate, no translation prompt contract, no merge driver, no site projector, and no manual translation skill remain.

The 14 source notes this consolidates, all now deleted:

- `2026-07-02-bilingual-docs-and-pairing-gate.md` — paired sibling files (`.md`/`.zh.md`/`.i18n.yaml`) with a blob-hash consistency record and `verify-translation-pairing` gate.
- `2026-07-13-documentation-site-projection.md` — canonical Markdown projected into VitePress via an explicit publication manifest (`website/docs.ts`), never copied.
- `2026-07-23-translation-prompt-v4-contract.md` — the calibrated automated-translation prompt's three-section (`translation`/`review`/`final`) response contract.
- `2026-07-26-briefed-minimal-translation-updates.md` — `gen-translation-brief` computed minimal diffs instead of whole-document re-translation.
- `2026-08-08-automatic-translation-pairing-merges.md` — a Git merge driver that auto-composed `.i18n.yaml` conflicts from clean owner-file merges.
- `2026-08-08-lightweight-routine-documentation-translation.md` — routine translation was a direct one-pass edit; the heavy skill was manual-invocation-only.
- `2026-08-09-chinese-contract-terminology.md` — standardized `contract` → `约定` in Chinese prose.
- `2026-08-18-localized-bilingual-links.md` — cross-doc links followed the source file's own locale (`.md` vs `.zh.md`).
- `2026-08-06-doc-site-carries-its-images.md` — the site copied referenced images into the generated tree instead of linking `raw.githubusercontent.com` (broken for a private repo).
- `2026-08-09-md-fragment-anchor-gate.md` — **not a doc-site/bilingual note itself** (it extended the still-relevant `verify-md-links` cross-link gate to validate `#fragment` anchors); listed among the 14 by the task but its unique content is general link-hygiene rationale, preserved below since `verify-md-links.ts` no longer exists in this repo either (confirmed) and the anchor-validation mechanism it added is gone with it.
- `2026-08-12-documentation-site-navigation-and-chrome.md` — VitePress sidebar ordering, navigation-target derivation, chrome-stripping (switcher/badge) during projection.
- `2026-08-13-published-document-fragments.md` — `verify-doc-site-fragments` validated fragment ids against VitePress's actual rendered HTML, not just GitHub's slug rules.
- `2026-08-20-doc-site-raw-markdown-twins.md` — the site emitted `.md` twins of every page plus `llms.txt`, following the Claude-docs convention for agent-readable pages.
- `2026-08-21-documentation-site-tag-release.md` — the site published only from a `dsh-v*` release tag via `workflow_dispatch`, matching the npm/Python release gating.

## Alternatives considered

**Keep the notes as historical record without consolidating.** Rejected: all 14 described present-tense shipped reality for a system with zero remaining code, config, or docs in this checkout. Leaving them active misrepresents current behavior to any future reader, which is exactly what the consolidation rule exists to prevent — the repo's own rule requires either updating implemented notes to match shipped reality or removing them, never leaving them stale.

**Archive instead of delete.** Rejected: archiving is for notes whose rationale might still guide future work even though the decision is closed (see `dsh-archive-agent-notes`). Most of the 14 notes' content is narrow implementation detail (VitePress sidebar pixel math, a merge-driver failure table, a translation-prompt escape-sequence protocol) with no future decision value once the system itself is gone — closer to "narrow adapter" / "completed documentation machinery" in the skill's own archive-worthy examples than to a durable boundary rule. The few genuinely reusable facts are folded into this note's Consequences section instead, per the consolidation rule's requirement to preserve unique rationale before deletion.

**Delete outright with no consolidating note.** Rejected: several of the 14 notes contain evaluated, non-obvious lessons (a controlled A/B benchmark of translation workflows; a documented false-positive investigation of Chinese search tokenization; why blob-hash pairing beat commit-hash pairing) that would otherwise be lost to git history alone, which the consolidation rule explicitly forbids relying on as the only copy of rationale.

## Consequences

- Documentation in this repo is English-only. Any future bilingual requirement starts fresh rather than reviving dead code, but should read this note first — the six evaluated alternatives to the paired-sibling-file model (English-canonical-with-fingerprint, locale directories, a separate translation repo, interleaved bilingual files, commit-hash records, and timestamp comparison) all lost for reasons unrelated to whether a doc site exists, and remain relevant if bilingual docs return: paired sibling files with a content-hash consistency record, checked in CI, was the strongest design found among Chinese-big-tech and Western-OSS precedent alike (ant-design, arco-design, ShardingSphere use the file convention; MDN, Vue's Ryu-Cho, Kubernetes, and Azure co-op-translator automate consistency, but none combined both).
- If bilingual docs return, the *benchmark methodology* from the briefed-minimal-updates note is worth repeating before rebuilding tooling: a controlled replay of real historical pair updates across competing workflows (status quo, briefed, no-guidance control, whole-document re-translation, small model, batched) found whole-document re-translation actively harmful (judged preservation collapsed from 9.8 to 4.4/10, drifted established terminology) rather than merely wasteful — re-translation-on-every-edit is not a safe fallback design for a future translation pipeline.
- If a documentation site returns, three narrow but non-obvious traps are worth re-discovering only once: (1) GitHub's Markdown-heading slug algorithm and a given site generator's own slug algorithm can diverge on punctuation/localized text, so a link that resolves in source Markdown can still 404 in the published HTML — validate against the actual build output, not just source-file existence; (2) a private repository cannot serve images via `raw.githubusercontent.com` (404s unauthenticated) — a doc site for a private repo must bundle its own image assets, not link back to the repo; (3) VitePress ships search-option functions to the browser via `Function.prototype.toString`/`new Function`, so such a function closing over a module-level constant silently returns no results in the rebuilt empty scope — a trap specific to that tool, not a general lesson, but expensive to rediscover (it was investigated as a suspected Chinese-tokenization gap that turned out not to exist: the corpus already had adequate Chinese search recall via short-token prefix matching, and the tokenizer change was built, measured, and reverted).
- Publishing any future public site from a release tag only (never on every merge, matching the npm/Python release gating already used for other public surfaces) remains this repo's general external-publication pattern and should be the default if a doc site is rebuilt, independent of which site generator is used.
- The Chinese terminology decision (`contract` → `约定`) and all other Chinese-specific content (terminology tables, translated prose, the merge driver, the pairing gate) carry no forward value on their own — the user has stated no bilingual/Chinese content is wanted anywhere in this repo.
