# Pending: full monorepo TypeScript -> buildless JS + webjsx-hyperscript conversion

## Decisions (all confirmed explicitly by user this session -- do not re-ask any of these)

1. Convert every workspace package we control (all of packages/*, apps/*,
   native/* -- 228 real packages after removing 2 stale tsconfig entries
   left over from an earlier deletion, see "Corrections already applied"
   below) from TypeScript source to plain buildless JS. Genuine external
   npm dependencies (node_modules) and vendor/* (9 packages: cosmokit,
   schemastery, cordis, loader, include, group, timer, hmr,
   logger-console -- confirmed by reading vendor/'s real directory
   listing and vendor/AGENTS.md's explicit "Do NOT edit vendor/*/src/
   files casually" guardrail) are EXEMPT, may keep their own stack.

2. Remove `tsc -b` typechecking entirely: `typecheck`/
   `typecheck:contracts-ready` scripts, the pre-push lefthook gate, the
   `typescript` devDependency everywhere. Already done this session:
   deleted 43 pre-existing hand-authored `.d.ts` sidecar files (32 dead
   `css-modules.d.ts`, 11 real cordis-augmentation/ambient files) -- see
   commit "Remove orphaned test infrastructure and dead type-only
   sidecars". No `.d.ts` sidecars survive this initiative going forward
   either -- cordis `declare module` augmentation blocks inside `.ts`
   files just get deleted along with the rest of the type syntax, same
   treatment as the 43 already removed.

3. **No topological dependency ordering needed** (confirmed, then
   verified by actually building the graph and hitting a 65-package
   cycle from devDependency edges): a mechanical .ts->.js conversion
   doesn't require a package's own dependencies to already be JS-only
   first -- nothing breaks at the source level regardless of order.
   Fan out in large parallel batches, order-independent.

4. **Pure-type packages** (e.g. packages/util/brand -- confirmed by
   direct inspection: its core export `Branded<B>` is
   `export type Branded<B> = string & {...}`, a compile-time-only
   construct with ZERO runtime representation, cannot become JS as-is):
   convert anyway, accept the loss of the nominal-typing safety
   property. A pure type alias becomes either deleted (if truly unused
   at runtime) or a plain passthrough/identity function if something
   calls a companion runtime caster. Flag every such package explicitly
   in the final report -- a real safety property is being intentionally
   given up, not accidentally lost, and that should be visible.

5. **THE BIG ONE, confirmed last: "we don't want tsx, we want webjsx."**
   This is NOT just renaming `.tsx` -> `.jsx` or stripping TS types from
   JSX files. Investigated directly: client UI packages (ui-primitives,
   ui-conversation, ~34 packages total with real `.tsx` JSX source) are
   NOT actually buildless today -- they still go through `tsdown` to
   produce a `lib/client.js` bundle served at `/plugins/<id>/client.js`
   (confirmed via packages/client/modules/src/index.ts's own bundle-
   serving route). Their `.tsx` source is never served raw; tsdown does
   real JSX-transform/bundling work regardless of TypeScript presence.
   webjsx's real programmatic API (confirmed by reading
   packages/client/vendor-modules/vendor/webjsx@0.0.73/dist/
   createElement.js) is `createElement(type, props, ...children)` -- a
   plain hyperscript function call, valid ES2020+ JS, no JSX parser
   needed at all. **Confirmed scope: every JSX expression across all
   ~34 client UI packages, hundreds of component files, gets hand-
   rewritten from JSX syntax (`<button class={x}>{children}</button>`)
   to `createElement()` calls, and `.tsx` files become plain `.js`.**
   This is comparable in size to the ORIGINAL React->webjsx conversion
   already completed earlier this session -- a real, large UI-code
   rewrite, not a mechanical type-strip. It is explicitly folded into
   this same initiative, not a separate one.

   Once this lands, those ~34 packages ALSO stop needing tsdown's JSX
   transform -- meaning they too can plausibly go fully buildless
   (served as raw `.js` source like `apps/web` already is, no more
   `/plugins/<id>/client.js` bundle route needed) -- but CONFIRM this
   explicitly with the user before assuming it; the original scope
   discussion only confirmed the createElement() rewrite itself, not
   necessarily deleting the client-modules bundle-serving route too.
   That routing/serving change is a distinct, separate piece of
   architecture from "stop writing JSX syntax" and deserves its own
   check-in when reached, not silent inclusion.

## Pacing

User explicitly chose "proceed now, full dynamic-workflow fan-out, no
further check-ins until done" for the TS-conversion pacing question --
but the createElement() rewrite scope was a SEPARATE, later confirmation
reached through genuine back-and-forth (multiple corrections needed:
first "topological ordering isn't needed" was volunteered and confirmed,
then "pure-type packages convert anyway" was confirmed, then the tsx/
webjsx distinction required TWO rounds of clarification before landing
on the true scope). Treat every one of the 5 decisions above as settled
and do not re-ask them, but the bundle-serving-route question flagged in
decision 5's last paragraph is genuinely still open -- ask that one when
reached.

## Corrections already applied this session (do not redo)

- `tsconfig.host.json` and `tsconfig.client.json` had 2 stale project
  references (`./packages/test-support/acp-snapshot`,
  `./packages/test-support/client-runtime`) left over from deleting
  those two packages earlier in the same session -- already removed.
  Real package count after this fix: 228 (not 243 -- the earlier count
  included these 2 stale ghosts plus some path-suffix artifacts from a
  sloppy first grep pass).

## Why this needs careful multi-session/multi-wave handling, not a single rushed pass

228 packages for the type-strip alone, PLUS a hand-rewrite of JSX across
~34 UI packages' worth of component files, is easily the largest single
body of work attempted this session -- larger than the GUI webjsx
conversion, server buildless conversion, 106-file CSS conversion, and
Vite removal COMBINED. Per gm's own Section 1b doctrine, this scale of
work is a default candidate for multi-session continuation with disk
state as the substrate -- this file IS that substrate. A fresh session's
boot probe should read this file in full before doing anything else.

## What a fresh session needs to do, in order

1. **Re-verify the 228 package list is still current** -- this session
   already caught one fabricated sub-agent report (0 tool_uses, invented
   numbers) for exactly this kind of count. ALWAYS verify directly:
   ```
   grep -oE '"\./[^"]+"' tsconfig.host.json | tr -d '"' | sed 's#^\./##' | sort -u > /tmp/h.txt
   grep -oE '"\./[^"]+"' tsconfig.client.json | tr -d '"' | sed 's#^\./##' | sort -u > /tmp/c.txt
   cat /tmp/h.txt /tmp/c.txt | sed -e 's#/tsconfig\.client\.json$##' -e 's#/tsconfig\.host\.json$##' | grep -v '^tsconfig' | grep -v '^vendor/' | sort -u
   ```

2. **Separate the 228 into two categories** before drafting the fan-out:
   - **Category A: plain `.ts` packages** (server/utility/host code, no
     JSX) -- the mechanical type-strip transform from this note's
     conversion spec applies directly, no ordering needed, safe for
     large parallel batches.
   - **Category B: packages with real `.tsx` JSX source** (~34, client
     UI packages) -- needs the createElement() hand-rewrite, which is
     NOT a mechanical strip (requires understanding each component's
     actual JSX structure, props spreading, conditional rendering,
     fragments, etc.) -- treat this as its own reviewed-mapping-then-
     fan-out sub-initiative, likely needing MORE per-file care than
     Category A, not less. Get an exact file list and file count for
     Category B before estimating effort -- do not guess "~34 packages"
     translates to any particular file count without checking.

3. **Draft ONE reviewed conversion spec for Category A** (type-stripping
   rules: interfaces, type aliases, generics, `as` casts, non-null
   assertions, enums [check runtime usage before choosing object-literal
   vs union-of-literals replacement], decorators [flag if found, don't
   silently drop], `import type`/`export type` deletion, cordis
   `declare module` block deletion, package.json `main`/`exports`/
   `types`/`files` field updates mirroring the exact shape already used
   by packages/host/webserver et al this session, cross-file import-
   extension fixups when a `.ts` file renames to `.js`) -- have a second
   agent adversarially review it BEFORE fan-out, per gm's own doctrine
   and this session's own successful precedent (the CSS Modules and
   Vite-removal specs both caught real defects this way).

4. **Draft a SEPARATE reviewed conversion spec for Category B**
   (createElement() rewrite rules: how JSX attribute spread `{...rest}`
   maps, how conditional rendering `{x && <span>...}` maps, how
   fragments `<>...</>` map [webjsx has a `Fragment` export, confirmed
   in createElement.js's own import], how the `css.foo` className
   pattern interacts, whether `class` vs `className` prop naming needs
   any change, how children arrays/nesting map) -- also adversarially
   reviewed before fan-out. This spec is materially riskier to get wrong
   than Category A's, since a subtly-wrong JSX->createElement() mapping
   produces a visually broken UI, not a parse error -- verification MUST
   include actually loading the app in a real browser (claude-in-chrome)
   and visually/functionally checking each converted component's
   surface, not just "the file imports without throwing."

5. **Fan out Category A first** (lower risk, more mechanical, larger
   package count) via Workflow in large parallel batches, verified live
   per-package (actually import/require the real entry point).

6. **Fan out Category B** once its spec is reviewed, likely smaller
   batches given the higher per-file care needed, with real browser
   verification after each batch -- this is the highest-risk phase of
   the whole initiative and deserves the most caution.

7. **Only after ALL packages in both categories convert**: remove
   `tsc -b` from `build:lib:host`/`build:lib:client`, delete every
   tsconfig file (root-level and all 228 package-level ones), remove
   `typecheck`/`typecheck:contracts-ready` scripts and the pre-push
   lefthook gate, remove `typescript` devDependency everywhere (review
   packages/typert/generator individually first -- its name suggests it
   GENERATES typed code from schemas and may have a genuinely different
   relationship to TypeScript than a normal package; do not bulk-apply
   without checking this one specifically), update
   packages/client/tsdown.client.ts (and any other tsdown config
   pointing at `lib/types/*.js`) to point at `src/*.js` directly.
   Doing any of this BEFORE both categories fully convert breaks the
   build for whatever hasn't converted yet.

8. **Revisit the client-modules bundle-serving route question** flagged
   in decision 5 above once Category B is done and stable -- ask the
   user explicitly whether the `/plugins/<id>/client.js` tsdown-bundle
   route should also be retired in favor of raw source serving (like
   apps/web already does), since this is a distinct architectural
   decision from "stop authoring JSX syntax," not automatically implied
   by it.

## Verification standard throughout (this repo's session-wide convention)

Zero test files, ever. Verification is live execution against the real
running system -- import/require the actual converted entry point,
boot the real dev server, load the real app in a real browser tab
(claude-in-chrome, when available) and check for console errors AND
visual/functional correctness, not just "it parses" or "it imports
without throwing." A syntax-clean-but-behaviorally-wrong conversion
(a JSX conditional mis-mapped, an enum stripped incorrectly, an `as`
cast that was hiding a real coercion) will not surface as a parse error.
