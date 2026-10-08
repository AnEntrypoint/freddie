# AGENTS.md — Web client packages

Rules for `packages/client/*`, the browser half of the web GUI (shell entry `apps/web`); they add to the repo [conventions](../../AGENTS.md#conventions) and [package rules](../AGENTS.md). Roster: [README](README.md). Design origins: [slot standard](../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md) (React-era: the model carries over, its `Props*` type names do not), [client architecture](../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.md).

## Stack

Buildless plain ESM `.js`, served as authored. No TypeScript, React, Vite, tsdown, `tsconfig`, `.ts`/`.tsx` source or test file exists under `packages/client` or `apps/web` ([why](../../.agents/notes/implemented/architecture/2026-09-02-buildless-workspace-no-transformation-at-launch.md)). Boot: `apps/web/src/main.js` → `AppWebEntry` (`web/src/boot.js`) reads `window.__FREDDIE_BOOT__` (the graph `modules` composes), boots the Cordis Loader over its rows, then `ui-renderer` mounts `root`. DOM is webjsx custom elements.

## Package shape and manifest

Name `@freddie/freddie-client-<dir>`. `exports`: `.` (node half `src/index.js`, an empty `apply` that puts the plugin in the Loader roster), `./invariant`, `./client` (browser half, under `src/`), `./src/*`, `./package.json`; `files` covers every runtime file either half imports (`pnpm run publint`). The package `src/` is served at `/plugins/<id>/~<rev>/…`.

`freddie.client` (parsed by `resolveMeta`, `modules/src/index.js`; `ui-slots`, `ui-primitives`, `web`, `css-manifest`, `vendor-modules` have none: static, not graph rows):

- `platform: 'web'` required (else skipped), and `./client` exported, or the scan throws.
- `inject`: package-name edges, informational only (display, HMR diffing); activation order is Cordis fiber `inject` waiting on services.
- `external`: requests beyond the baseline ([below](#shared-modules-and-the-module-graph)).
- `immediately: true`: stage-one prefetch with modulepreload; infrastructure rows only (connection, hmr, locale, modules, runtime, ui-renderer, ui-theme).

A new package needs the shape above, a `{ id, name }` row in `packages/bundle/web-app/cordis.patch.yml`, a `dependencies` entry in `packages/bundle/web-app/package.json`, a README with Model Experience, and `src/invariant.js`.

## Shared modules and the module graph

Baseline, implicit for every package (never declare): `PLATFORM_MODULES` in `web/src/platform.js` (`webjsx`, `@freddie/cordis`, `ui-slots`, `ui-primitives`, seeded by `web/src/seed.js`) and `PRELOADED_CLIENT_EXTERNALS` (`runtime/client`). `freddie.client.external` lists the exact specifier of every other value import: a graph row (only a trailing `/client` aliases the row) or a workspace wire module such as `@freddie/freddie-session/surface` (served at `/workspace/<specifier>`); an undeclared one has no import-map entry and fails at `import()`. Silence means a private copy; `import type` requests nothing. A row may not name itself; cycles throw. Bare npm imports resolve through the `vendor-modules` map.

Service `inject` (the fiber waits, unsatisfied stays PENDING; cycles allowed) and module `external` (`require` is synchronous, unsatisfied throws; cycles rejected) are separate axes: `modules` orders rows topologically by `external`, independent of activation.

## Slots and the props kit

`ui-slots` is the registry, `runtime/src/client/slots.js` the `ctx.slots` service, `ui-renderer` the renderer; only the shell renders `root`.

1. One API: `ctx.slots.register({ name, children?, store?, inject?, locale? }, component)`. `children` (`{ kind: 'single'|'keyed'|'list'|'chain', scope: 'root'|'session'|'session-maybe' }`) declares and authorizes the slots the component renders; an undeclared or redeclared one throws at load. Names follow `<domain>.<entry>.<hole>`. Kind fields: keyed `key`, list `id`/`order`/`label`, chain `select` (`null` declines; never mount to render nothing).
2. The component is `webjsxSlot('freddie-x')` (an element the package defined) or a bare function returning a VNode.
3. Props, owner last: standard kit (`useSessions`, `useWorkspaces`; session scope adds `sessionId`, `useSession`, `useProjection`; `t` with `locale`; `useStore`/`actions` with `store`; `renderSlot`/`renderSlotChain`/`SessionProvider` with `children`), the `inject` return, the slot's own inject, owner props. Never hand-build a kit member.
4. Hooks are framework-made only. `use*` is a synchronous snapshot read: call it in `#render()`, where the outlet records reads (`trackReads`) and re-renders on change. Pass plain data and callbacks, never a hook, selector or subscription.
5. `inject` returns plain data and callbacks from the apply closure's `ctx`; a private reactive fact goes in its reserved `hooks` compartment (bare observables bound to `use<Name>`).
6. Data channels: the parent knows it: owner props; only the element: instance fields; shared or remount-surviving: a store declared at `register` (export only a `createXStore()` factory built with `defineStore`, no module-level handle). Anything else is a new framework extension point for the owner to decide.
7. Domains share JSON-compatible data and callbacks; content goes through a slot, never a VNode prop. An observable source keeps its identity and its snapshot reference until the fact moves; a rebuilt published value is republished through the same source in the same step.
8. Into another package's slot: `ctx.slots.inject(name, () => ctx.slots.register(...))` (waits for the declaration, removes on collapse, reruns on redeclaration, leaves with the caller's fiber; an iterable of disposers is atomic). A bare `register` into an undeclared slot throws.
9. Elements never see `ctx`: thread a prop from owner site, store or inject.

## Elements

Define elements with `defineElement(tag, Class)` from `ui-primitives`, never `customElements.define`: it keeps the logical tag stable across HMR swaps (versioned names, patched `createElement`, `data-ce="<tag>"`). An element has `setProps(props)` and `#render()` ending in `applyDiff(this, vdom)`.

## Layering

- Object layer, DOM-free (`runtime/src` references no DOM or webjsx): `connection` (`ConnectionController`), then `runtime` (`SessionManager`, `Session`, workspaces, the hand-rolled `defineStore` engine). It owns business state; entry stores hold only viewing state.
- `rpcId` is bidirectional: the initiator mints, the responder echoes (`connection/src/client/rpc.js` throws on mismatch) ([note](../../.agents/notes/implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)).
- "How to draw" data (tool-card views, queue states) never enters the session log: the host computes it per frame or pushes it live, replay recomputes it, the UI falls back to the generic form. New model-visible input needs a session event.

## Conversation nodes

A Chat business feature registers one definition (`kind`, `match(event)` giving `{ id, role: 'start'|'update' }`, `start`, `update`, `buildLocationData(context, scope)`) via `ctx.conversationEvents.register` plus a keyed renderer in `conversation.chat.node`; its switch or fold never enters `Session`, `SessionManager` or a central dispatcher. Model on `ui-deliverables/src/client/turn-deliverables.js`; the [cookbook](../../docs/cookbook/adding-a-conversation-node.md) has the rules (React-era sample). `match` reads only the current event; a multi-event context shares one stable business id; `update` replays deterministically by `seq`; hot paths never scan the whole window.

## Export discipline

`/client` exports only what Cordis loading needs (`name`, `inject`, `apply`, `Config`). Element classes some entries re-export have no cross-package consumer (browser halves import only `ui-slots`, `ui-primitives`, `runtime/client` besides themselves) and license nothing: a new value export needs owner sign-off. Cross-plugin use goes through slots and ctx services; else escalate.

## Dependencies

`@freddie/cordis` is peer plus dev in every package; dynamic internal `@freddie/freddie-*` packages (imported, re-exported, or in `freddie.client.inject`) are peer plus dev; static ones (`ui-slots`, `ui-primitives`) are dev only; `@freddie/webjsx` and libraries (`clsx`) go in `dependencies`.

## Styling

- Each component owns `X.css` plus a hand-written `X.css.js` map of logical name to class `freddie-<component>__<name>` (keep the pair in step; combine with `clsx`). No literal colors, component library or Tailwind: use `--freddie-alias-*`, `--dsw-*`, `--ds-*` tokens. Global sheets live in `ui-theme/src/styles/`; their `.css.js` is the sheet text, injected as `<style data-plugin>` by `installThemeStyles`.
- `css-manifest` serves every listed `.css` as `/styles/app.css?rev=<hash>`. Regenerate `src/manifest.js` with `node packages/client/css-manifest/scripts/generate-manifest.mjs` (reads `git ls-files '*.css'`; id = path minus `packages/` and `.css`, `/` and `.` → `-`): a new stylesheet is not served until tracked (`git add` first) or hand-added, and regeneration drops hand-added untracked lines.
- Browser code may read `process.env.FREDDIE_CLIENT_*`, rendered into the page by `vendor-modules` (no bundler define); each value is public page content.

## Locale

English only; other languages are banned everywhere. `src/client/locales.js` exports `en`, registered with `ctx.effect(() => ctx.locale.register(NS, { en }), '<pkg>: dictionaries')` and read through the `t` seat (`locale: NS` at `register`).

## Invariant companion

`src/invariant.js` exports `name`, `inject = ['invariants']` and an `apply` registering the package name with an installer checking an owned event or data relation; with none, the empty installer carries a package-specific `No runtime invariant:` reason ([rules](../AGENTS.md)), kept in the package's `AGENTS.md` `## Rationale` while its source has no comments.

## Dev loop, HMR, boot failures

`client-hmr` watches each graph row's `src/` tree (native `fs.watch`, with polling only for roots without complete native watchers) and `/plugins/events` (WebSocket) carries `rebuilt`, `css-rebuilt`, `shell-rebuilt`, `graph`, `host-reloaded` frames. A rebuilt plugin re-imports at its new `/~<rev>/` URL and its fiber swaps in place; a stylesheet edit swaps the `app.css` link; the shell roots (`apps/web`, `web`) remount in-document; other shell-seeded roots (`ui-slots`, `ui-primitives`) need a reload. Read `window.__FREDDIE_HMR__` (journal) and the `freddie:hmr` event. After each rebuild `AppWebEntry.health()` decides: unhealthy, one in-document remount, then a boot-page report and one automatic reload (`AUTO_RELOAD_KEY`, refunded when health passes). The boot page (`web/src/boot-page.js`) is the failure surface after boot too; `apps/web/index.html` writes a static message after 10 s if no script ran.

## Verification

No test suite, coverage gate or `verify-*` script exists. Verify in the same change in real Chrome (gm `cdp` verb): drive the feature and read EVERY fiber under `window.__FREDDIE_SHELL__.ctx`, not only entry states. `health()` judges only boot-roster entries and the mount, so a nested fiber (`ctx.plugin(Service)`, a `slots.inject` callback) can be FAILED while its entry reads active (shortcuts did).

## Comments

No comments in source: make the code self-explanatory; a fact a name cannot carry goes to the package's `AGENTS.md` (`## Rationale`, `## CSS rationale`).

## Known gaps

- `ui-settings-general/package.json` `files` lists `lib/client.js`, which no build produces.
