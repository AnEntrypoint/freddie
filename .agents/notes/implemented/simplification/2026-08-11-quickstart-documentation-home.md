# Agent Note: Route documentation roots to quick start

Status: implemented

## Problem

A separate documentation landing page duplicates product positioning and feature summaries owned by the product landing page. Those parallel claims require synchronization and review without helping readers reach technical instructions.

## Decision

Each locale root is a redirect page. `/` sends readers to `./guide/quickstart`, and `/en/` resolves the same relative target to `/en/guide/quickstart`. The relative target preserves the configured `DOCS_BASE` when the site is hosted below an origin path.

`docs/user/index.md` and `docs/user/index.zh.md` owned the redirect as VitePress frontmatter. The [now-removed documentation site and bilingual docs](../process/2026-09-02-drop-doc-site-and-bilingual-docs.md) published only that frontmatter for locale homes, so the canonical Markdown retained its bilingual switcher without rendering a second landing page. The projector test verified that both locale roots used the same locale-relative quick-start target. The documentation site and its `.zh.md` counterpart are gone; this file is English-only.

Product positioning and feature summaries stay outside the documentation site. Guide, development, reference, search, and locale navigation remain available from the quick-start page.

## Alternatives considered

**Keep a documentation hero and synchronize its wording.** This preserves a promotional entry page but creates a second product narrative whose claims and terminology can drift from the product landing page.

**Render a documentation index at the root.** An index repeats the navigation already provided by the site and inserts another choice before the first actionable guide.

**Copy quick-start content to each locale root.** Two public routes would then own the same tutorial and require another synchronization mechanism.

**Use origin-absolute redirect targets.** Paths such as `/guide/quickstart` ignore `DOCS_BASE` and fail when the documentation site is hosted below an origin path.

## Consequences

Readers entering either locale root immediately reach the quick-start tutorial in that locale. The documentation site gives up a promotional home surface, while the product landing page remains the single owner of positioning and feature summaries. The stable root routes remain valid entry points, and quick-start content retains one canonical source.
