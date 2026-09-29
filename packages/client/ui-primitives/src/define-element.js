
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

export function resolveElementTag(tag) {
  const state = globalThis[REGISTRY]
  return state === undefined ? tag : state.alias.get(tag) ?? tag
}

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
