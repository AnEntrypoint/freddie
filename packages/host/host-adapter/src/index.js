import services from './services.js'

export class FxUnsupported extends Error {
  name = 'FxUnsupported'
  code = 'ERR_FX_UNSUPPORTED'

  constructor(what) {
    super('fx:host does not provide ' + what)
    this.what = what
  }
}

export class FxHostContractError extends Error {
  name = 'FxHostContractError'
  code = 'ERR_FX_HOST_CONTRACT'
}

export function namespaceOf(host, row) {
  if (row.source === 'tools') return host.tools
  if (row.source === 'verbs') return host.verbs
  if (row.source === 'modules') return host.modules?.[row.key]
  return undefined
}

export function hostView(host, id, row) {
  const namespace = () => {
    const found = namespaceOf(host, row)
    if (found === undefined) throw new FxUnsupported(id)
    return found
  }
  const allowed = row.members === null ? null : new Set(row.members)
  const permitted = (key) => allowed === null || allowed.has(key)
  return new Proxy({}, {
    get(_, key) {
      if (typeof key === 'symbol' || key === 'then') return undefined
      if (!permitted(key)) throw new FxUnsupported(id + '.' + key)
      const target = namespace()
      const value = target[key]
      if (value === undefined) throw new FxUnsupported(id + '.' + key)
      return typeof value === 'function' ? value.bind(target) : value
    },
    has: (_, key) => permitted(key) && key in namespace(),
    ownKeys: () => (allowed === null ? Reflect.ownKeys(namespace()) : [...allowed].filter((key) => key in namespace())),
    getOwnPropertyDescriptor: (_, key) => (permitted(key) && key in namespace() ? { enumerable: true, configurable: true } : undefined),
    set() {
      throw new FxUnsupported(id + ' assignment')
    },
  })
}

export function planHost(host, table = services) {
  if (host?.version?.interface !== 1) throw new FxHostContractError('fx:host interface 1 is required, found ' + String(host?.version?.interface))
  if (!Array.isArray(host.capabilities)) throw new FxHostContractError('fx:host must list its capabilities as an array')
  const reported = new Set(host.capabilities)
  const register = []
  const gaps = []
  const absent = []
  for (const [id, row] of Object.entries(table)) {
    if (row.capability === null) gaps.push(id)
    else if (!reported.has(row.capability)) absent.push(id)
    else if (namespaceOf(host, row) === undefined) throw new FxHostContractError(id + ' is reported present but the host has no ' + (row.key ?? row.source) + ' namespace')
    else register.push(id)
  }
  const named = new Set(Object.values(table).map((row) => row.capability))
  const unknown = [...reported].filter((capability) => !named.has(capability))
  return Object.freeze({ register, gaps, absent, unknown })
}

export function createHostAdapter(host, table = services) {
  return {
    name: 'host-adapter',
    apply(ctx) {
      for (const id of planHost(host, table).register) {
        ctx.provide(table[id].service)
        ctx.set(table[id].service, hostView(host, id, table[id]))
      }
    },
  }
}

export { services }
