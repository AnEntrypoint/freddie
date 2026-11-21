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

const PROMISE_PROBE = 'then'

export function hostView(host, id, row) {
  const namespace = () => {
    const found = host[row.namespace]
    if (found === undefined) throw new FxUnsupported(id)
    return found
  }
  const allowed = row.members === null ? null : new Set(row.members)
  const permitted = (key) => allowed === null || allowed.has(key)
  return new Proxy(row.callable ? function hostNamespace() {} : {}, {
    get(_, key) {
      if (typeof key === 'symbol' || key === PROMISE_PROBE) return undefined
      if (key === '$list' && row.namespace === 'tools') return () => namespace().$list().filter((entry) => allowed.has(entry.name))
      if (!permitted(key)) throw new FxUnsupported(id + '.' + key)
      const target = namespace()
      const value = target[key]
      if (value === undefined) throw new FxUnsupported(id + '.' + key)
      return typeof value === 'function' ? value.bind(target) : value
    },
    has: (_, key) => permitted(key) && key in namespace(),
    ownKeys: () => (allowed === null ? Reflect.ownKeys(namespace()) : [...allowed].filter((key) => key in namespace())),
    getOwnPropertyDescriptor: (_, key) => (permitted(key) && key in namespace() ? { enumerable: true, configurable: true } : undefined),
    apply: (_, receiver, args) => namespace()(...args),
    set() {
      throw new FxUnsupported(id + ' assignment')
    },
  })
}

export function planHost(host, table = services) {
  if (host?.version?.interface !== 1) throw new FxHostContractError('fx:host interface 1 is required, found ' + String(host?.version?.interface))
  const capabilities = host.capabilities ?? {}
  const register = []
  const flags = []
  const absent = []
  for (const [id, row] of Object.entries(table)) {
    if (capabilities[id]?.present !== true) absent.push(id)
    else if (row.service === null) flags.push(id)
    else if (host[row.namespace] === undefined) throw new FxHostContractError(id + ' is reported present but the host has no ' + row.namespace + ' namespace')
    else register.push(id)
  }
  const unknown = Object.keys(capabilities).filter((id) => !(id in table))
  return Object.freeze({ register, flags, absent, unknown })
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
