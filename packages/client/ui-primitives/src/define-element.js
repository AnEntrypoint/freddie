/**
 * Custom-element registry that survives plugin hot swaps.
 *
 * `customElements.define` binds a tag name for the document's lifetime, so a
 * re-imported module could never re-register its class and every element it
 * created kept running the original code. `defineElement` keeps the LOGICAL
 * tag stable for callers (`document.createElement('freddie-x')`,
 * `h('freddie-x')`, CSS via `data-ce`) while registering each new class under
 * a versioned name (`freddie-x`, then `freddie-x--v2`, `--v3`, …) and
 * repointing an alias map that the patched `Document.prototype.createElement`
 * consults. The first definition uses the bare tag, so a page that never hot
 * reloads has exactly the DOM it had before this registry existed.
 *
 * State lives on `globalThis` under a `Symbol.for` key rather than in module
 * scope: a shell remount re-imports this package under a new URL prefix and
 * must see the same alias map and never install the createElement patch twice.
 */

const REGISTRY = Symbol.for('freddie.custom-elements')

function registry() {
  const existing = globalThis[REGISTRY]
  if (existing !== undefined) return existing
  const created = { alias: new Map(), classes: new Map(), versions: new Map(), patched: false }
  globalThis[REGISTRY] = created
  return created
}

function patchCreateElement(state) {
  if (state.patched || typeof Document === 'undefined') return
  const native = Document.prototype.createElement
  Document.prototype.createElement = function createElement(tag, options) {
    const name = typeof tag === 'string' ? state.alias.get(tag) ?? tag : tag
    return native.call(this, name, options)
  }
  state.patched = true
}

function wrap(tag, Class) {
  return class extends Class {
    connectedCallback() {
      this.setAttribute('data-ce', tag)
      super.connectedCallback?.()
    }
  }
}

/**
 * Resolve a logical tag to the element name its newest class is registered
 * under (the tag itself until a hot reload re-defines it).
 * @param tag - logical custom-element tag.
 * @returns the currently registered name for `tag`.
 */
export function resolveElementTag(tag) {
  const state = globalThis[REGISTRY]
  return state === undefined ? tag : state.alias.get(tag) ?? tag
}

/**
 * Register `Class` for the logical `tag`. The first call defines `tag`
 * itself; a later call with a different class defines `${tag}--v${n}` and
 * makes it the class `createElement(tag)` constructs from then on; the same
 * class object again is a no-op. Without a `customElements` global (server,
 * worker) nothing is registered.
 * @param tag - logical custom-element tag.
 * @param Class - HTMLElement subclass; instances carry `data-ce="<tag>"` once connected.
 * @returns the element name the class is registered under.
 */
export function defineElement(tag, Class) {
  if (typeof customElements === 'undefined') return tag
  const state = registry()
  patchCreateElement(state)
  if (state.classes.get(tag) === Class) return state.alias.get(tag)
  let version = (state.versions.get(tag) ?? 0) + 1
  let name = version === 1 ? tag : `${tag}--v${version}`
  while (customElements.get(name) !== undefined) {
    version += 1
    name = `${tag}--v${version}`
  }
  customElements.define(name, wrap(tag, Class))
  state.classes.set(tag, Class)
  state.versions.set(tag, version)
  state.alias.set(tag, name)
  return name
}
