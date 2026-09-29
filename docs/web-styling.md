# Web UI style reference

This reference defines styling ownership and component rules for browser client packages. The current token values live in [`packages/client/ui-theme/src/styles/`](../packages/client/ui-theme/src/styles/); this document does not duplicate that hand-written inventory. The client conventions it summarizes are owned by [`packages/client/AGENTS.md`](../packages/client/AGENTS.md#styling).

## Ownership

[`ui-theme`](../packages/client/ui-theme/README.md) owns the `--dsw-*` static scale, semantic aliases, typography, motion, gradients, shadows, scrollbar styles, and light/dark preference. [`ui-layout`](../packages/client/ui-layout/README.md) applies the resolved theme snapshot to the document. Feature packages consume semantic aliases and do not define another global theme.

Global style sheets belong in `ui-theme/src/styles/`; each is a hand-written `X.css` whose sibling `X.css.js` holds the sheet text that `installThemeStyles` injects as a `<style data-plugin>` element. Component styles live beside their component as a hand-written `X.css` plus an `X.css.js` map from each logical name to a class named `freddie-<component>__<name>`; keep the pair in step. A component may define a local custom property when its value is part of that component's layout or presentation contract; shared colors, typography, elevation, and motion belong to the theme package.

## Component rules

- Import the component's `X.css.js` map and combine classes with `clsx`; do not add a component library or Tailwind.
- Use `--freddie-alias-*` semantic tokens in feature components. Do not copy static palette values or write literal colors there.
- Keep theme selectors out of feature component CSS. Light/dark overrides belong to the theme owner.
- Pair font sizes with line heights and use the theme typography variables when an existing role matches.
- Keep source text, terminal output, and diff lines unwrapped when their component contract requires column preservation; use the shared scrollbar styles rather than component-specific scrollbar selectors.
- Put presentation in CSS. Inline `style` attributes may pass component-local custom-property values but must not encode theme branches.
- Preserve keyboard focus visibility and reduced-motion behavior when adding transitions or hover-only controls.

## Changing the system

Add or change a shared token in the owning `ui-theme` sheet, then consume its semantic alias from feature packages. Update the owning package reference when a public styling contract changes. A new stylesheet is served only once the [`css-manifest`](../packages/client/css-manifest/AGENTS.md) package lists it: track the file with git, then regenerate `src/manifest.js` with `node packages/client/css-manifest/scripts/generate-manifest.mjs` (it reads `git ls-files '*.css'`); `css-manifest` serves every listed sheet as `/styles/app.css?rev=<hash>`. Verify visual behavior live in a real browser; the [styling-system Agent Note](../.agents/notes/implemented/process/2026-07-19-web-styling-system.md) records the rationale; its CSS Modules and Vite details describe the stack from before the client became buildless plain JavaScript.
