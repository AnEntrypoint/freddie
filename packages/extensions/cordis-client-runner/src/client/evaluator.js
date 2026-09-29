const TIMER_REDIRECT
  = 'browser timer globals are unavailable in dynamic packages. Declare inject: [\'timer\'] on the returned plugin, '
    + 'query Client Service.listService for the exact API, and close over that plugin ctx. In React, create timers '
    + 'from an event handler or React.useEffect and return callback-form disposers from the effect cleanup.'

export const DYNAMIC_CLIENT_REDIRECTS = {
  setTimeout: TIMER_REDIRECT,
  setInterval: TIMER_REDIRECT,
  clearTimeout: TIMER_REDIRECT,
  clearInterval: TIMER_REDIRECT,
  fetch:
    'network belongs to the HOST half: register a handler there with harness.handle(method, fn) and call it here via host.call(method, args).',
  require:
    'modules cannot be imported here. Everything goes through ctx services or host.call.',
  React:
    'there is no React runtime in this app — the whole GUI is webjsx. Return a plain object/array JSX tree from a '
    + 'function (stateless) or an HTMLElement subclass registered with defineElement from @freddie/freddie-client-ui-primitives (stateful, exposing '
    + 'setProps); see the tool.view.cordis business-view contract for the expected shape.',
}

function closureTraps() {
  const traps = {}
  for (const [name, redirect] of Object.entries(DYNAMIC_CLIENT_REDIRECTS)) {
    traps[name] = () => {
      throw new Error(`${name} is not available in a dynamic client half — ${redirect}`)
    }
  }
  return traps
}

function harnessTrap() {
  return new Proxy({}, {
    get(_target, prop) {
      throw new Error(
        `harness.${String(prop)} belongs to the HOST half (\`code\`): register handlers there with harness.handle(method, fn); `
        + 'the browser half calls them via host.call(method, args).',
      )
    },
  })
}

export class DynamicCordisStyles {
  tags = new Set()

  constructor(pluginId) {
    this.pluginId = pluginId
  }

  insert(css) {
    if (typeof css !== 'string') throw new Error('styles.insert(css) needs a CSS string')
    const tag = document.createElement('style')
    tag.dataset.dyn = this.pluginId
    tag.textContent = css
    document.head.append(tag)
    this.tags.add(tag)
    return () => {
      this.tags.delete(tag)
      tag.remove()
    }
  }

  get count() {
    return this.tags.size
  }

  dispose() {
    for (const tag of this.tags) tag.remove()
    this.tags.clear()
  }
}

function errorText(arg) {
  if (arg instanceof Error) return arg.message
  if (typeof arg === 'string') return arg
  if (arg === undefined) return 'undefined'
  try {
    return JSON.stringify(arg)
  } catch {
    return '[unserializable console argument]'
  }
}

function taggedConsole(pluginId, noteError) {
  const tag = `[cordis:${pluginId}]`
  const forward = level => (...args) => {
    console[level](tag, ...args)
    if (level !== 'error') return
    noteError(args.map(errorText).join(' ').slice(0, 500))
  }
  return {
    ...console,
    log: forward('log'),
    info: forward('info'),
    warn: forward('warn'),
    error: forward('error'),
    debug: forward('debug'),
  }
}

export function isDynamicCordisPlugin(value) {
  if (typeof value === 'function') return true
  return typeof value === 'object' && value !== null
    && typeof value.apply === 'function'
}

const NODE_GLOBALS_HIDDEN_FROM_PACKAGES = ['process', 'Buffer']

export async function evaluateClientHalf(pluginId, clientCode, env, styles) {
  const traps = closureTraps()
  const parameters = ['console', 'styles', 'host', 'harness', ...Object.keys(traps), ...NODE_GLOBALS_HIDDEN_FROM_PACKAGES]
  let closure
  try {
    const factory = new Function(...parameters, `return (async () => {\n${clientCode}\n})()`)
    closure = factory
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    throw new Error(
      `client half failed to parse in this browser: ${error.message}\n`
      + 'The browser half is plain JavaScript (no JSX, no TypeScript); build elements with plain object/array JSX trees or DOM APIs.',
    )
  }
  const host = {
    call: (method, args = null) => env.invoke(method, args),
  }
  const returned = await closure(
    taggedConsole(pluginId, (message) => { env.noteError(message) }),
    styles,
    host,
    harnessTrap(),
    ...Object.values(traps),
    ...NODE_GLOBALS_HIDDEN_FROM_PACKAGES.map(() => undefined),
  )
  if (!isDynamicCordisPlugin(returned)) {
    if (returned === undefined) {
      throw new Error(
        'client half returned `undefined` — did you forget `return`?\n'
        + '  ✓ return (ctx) => { … }\n'
        + '  ✓ return { name: \'…\', inject: [\'slots\'], apply(ctx) { … } }',
      )
    }
    throw new Error('client half must `return` a plugin: a function, or an object with an `apply(ctx)` method')
  }
  return returned
}
