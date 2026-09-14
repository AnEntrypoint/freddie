# Agent Note: Custom-element registry for plugin hot swaps

Status: implemented

## Problem

Client plugins define their views as custom elements (84 files across 34 packages, 98 tags), and the browser half of `client-hmr` swaps a rebuilt plugin's cordis fiber in place: it drops the runtime record, drains the old fiber, removes its styles, and re-imports the bundle so its slot output re-renders from scratch. That swap could never carry an element edit. `customElements.define` binds a tag for the document's lifetime, so every definition site guarded itself with `customElements.get(tag) === undefined`, the re-imported module's define was a silent no-op, and every element the re-render created still constructed the ORIGINAL class. The host therefore flagged such rows `definesCustomElements` and the client answered with `location.reload()` — the one exit that dropped `window` identity, which the never-restart contract in [the never-restart note](2026-09-09-never-restart-hmr.md) exists to keep. Prototype patching was not available either: every element class uses `#private` fields, whose brand checks reject a swapped prototype.

## Decision

`@freddie/freddie-client-ui-primitives` exports `defineElement(tag, Class)` (`src/define-element.js`), and it is the only caller of `customElements.define` in client source. The package is a live-workspace vendor module resolved through the import map, so it is one module instance that plugin swaps never replace.

- The first `defineElement` for a tag defines the bare tag. A later call with a different class defines `<tag>--v<n>` (n = 2, 3, …, skipping any name the registry already holds) and repoints an alias map; the same class object again is a no-op. Without a `customElements` global nothing is registered.
- The registered constructor is a subclass wrapper whose `connectedCallback` sets `data-ce="<logical tag>"` and then delegates; `#private` fields, `static observedAttributes`, and `attributeChangedCallback` on the wrapped class keep working because the base constructor installs them on subclass instances and statics resolve through the constructor chain.
- `Document.prototype.createElement` is patched once to resolve the alias for string tags and pass `options` through. webjsx's `createDOMElement` calls `document.createElement`, and its diff compares the virtual node's own `tagName` (derived from the type string), so `h('freddie-x')` needs no framework change and a parent re-render keeps reusing a versioned element.
- Registry state (alias, class, version per tag, patched flag) lives on `globalThis[Symbol.for('freddie.custom-elements')]`, so a shell remount that imports the package again under `/__hmr/<rev>/` shares it.
- The two stylesheets that selected element tags (`ui-layout/src/client/AppFrame.css`, `ui-conversation/src/client/skeleton/ConversationRoot.css`) select `[data-ce='…']` instead.
- All 98 guarded define blocks were rewritten by one script from a single reviewed mapping to `defineElement('<tag>', <Class>)`, with the import merged into each file's existing named import from ui-primitives, added as a new bare import, or a relative `./define-element.js` import inside ui-primitives. The four defining packages that did not yet declare ui-primitives (`ui-directory-picker-native`, `ui-layout`, `ui-observability`, `ui-renderer`) declare it under `devDependencies` like every other importer.

Because the literal `customElements.define` no longer appears in any plugin tree, the host's `treeDefinesCustomElements` classification stops flagging rows and the ordinary fiber swap runs; the client's `definesCustomElements` reload branch is left to the `client-hmr` owner to delete.

## Alternatives considered

**Patch the existing class's prototype with the new module's methods.** Rejected: every element class uses `#private` fields; a method copied onto the old prototype fails the brand check on `this.#props`. Nothing short of constructing instances of the new class works.

**Remount the shell (`/__hmr/<rev>/`) instead of reloading the document.** Rejected: the shell remount re-imports modules under a new URL, but `customElements` is per document, not per module graph, so the tag stays bound to the old class.

**Rewrite the 101 creation sites (`document.createElement('freddie-…')`, `h('freddie-…')`) to call a resolver.** Rejected: one patched `Document.prototype.createElement` covers both paths, keeps call sites naming the logical tag, and covers `webjsxSlot(tag)` markers that reach `createElement` through ui-renderer's `freddie-entry-host`.

**Keep the `location.reload()` exit for element-defining rows.** Rejected: it is the last reload in the client HMR path, and 84 of the plugin files are element definitions, so it fired for most edits.

## Consequences

Two constraints on wrapped classes follow from the wrapper: `connectedCallback` must be a prototype method (an instance-field arrow shadows the wrapper's, so `data-ce` is never set), and elements must be created through `createElement`/`h`, never `new FreddieX()` (only the wrapper is registered). Neither shape exists in the tree; both are recorded in the package README. Swapping the plugin that owns the `root` slot exposed a window in which `FreddieRootOutlet` re-rendered with no root registrant and threw its boot-order `SlotAssemblyError`; the outlet now renders an empty anchor once it has rendered before, keeping the throw for a genuine boot-order fault.

A hot-reloaded element renders as `<freddie-x--v2 data-ce="freddie-x">`; `localName` therefore varies across a session and only `data-ce` is stable, which is why no CSS or query may select these tags by name. Elements the swap did not re-create (ones owned by a plugin that was not rebuilt) keep their earlier class, exactly as before. Each rebuild of the same plugin adds one registration per tag it defines for the life of the document; the registry never unregisters, because the platform offers no way to. The vendored snapshot under `packages/client/vendor-modules/vendor/@freddie/freddie-client-ui-primitives@…` still carries the old guarded defines; it is not served for this package (vendor-modules resolves it from the live workspace) and belongs to its generator.
