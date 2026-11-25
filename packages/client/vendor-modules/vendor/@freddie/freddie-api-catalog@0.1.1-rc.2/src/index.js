const CONTEXT_PROPERTY = /^[A-Za-z_$][\w$]*$/

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function contextProperty(key) {
  return CONTEXT_PROPERTY.test(key) ? `ctx.${key}` : `ctx[${JSON.stringify(key)}]`
}

export function apiQueries({ services, events, types }) {
  function referencedTypeClosure(seeds) {
    const included = new Set()
    let frontier = [...seeds]
    while (frontier.length > 0) {
      const next = []
      for (const entry of types) {
        if (included.has(entry.name)) continue
        const pattern = new RegExp(`(?<![\\w$])${escapeRegExp(entry.name)}(?![\\w$])`)
        if (!frontier.some(text => pattern.test(text))) continue
        included.add(entry.name)
        next.push(entry.declaration)
      }
      frontier = next
    }
    return types.filter(entry => included.has(entry.name))
  }

  function queryServiceApi(key, list = services) {
    if (key === undefined) {
      return {
        mode: 'catalog',
        services: list.map(service => ({
          key: service.key,
          description: service.summary,
          methods: service.methods.map(method => ({ signature: method.signature })),
        })),
      }
    }
    const service = list.find(candidate => candidate.key === key)
    if (service === undefined) throw new Error(`no catalogued Service named "${key}"`)
    return {
      mode: 'service',
      service: {
        key: service.key,
        description: service.description,
        access: {
          optional: { expression: `ctx.get(${JSON.stringify(service.key)})`, requiresUndefinedCheck: true },
          hardDependency: { inject: [service.key], expression: contextProperty(service.key) },
        },
        methods: service.methods,
      },
      referencedTypes: referencedTypeClosure(service.methods.map(method => method.signature)),
    }
  }

  function queryEventApi(name, list = events) {
    if (name === undefined) {
      return {
        mode: 'catalog',
        events: list.map(event => ({
          name: event.name,
          description: event.summary,
          mode: event.mode,
          signature: event.signature,
        })),
      }
    }
    const event = list.find(candidate => candidate.name === name)
    if (event === undefined) throw new Error(`no catalogued Event named "${name}"`)
    return {
      mode: 'event',
      event: {
        name: event.name,
        description: event.description,
        mode: event.mode,
        signature: event.signature,
        parameters: event.parameters,
      },
      referencedTypes: referencedTypeClosure([event.signature]),
    }
  }

  return { queryServiceApi, queryEventApi }
}
