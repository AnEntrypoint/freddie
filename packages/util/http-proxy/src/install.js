
import {
  isSupportedProxyUrl,
  POLICY_ENV_NAMES,
  PROXY_ENV_NAMES,
  proxyForUrl,
  resolveProxyPolicy,
} from './policy.js'

let active

let inheritedProxyEnv

let installed

const DIRECT_ROUTE = { proxied: false }

export function proxyRouteFor(url) {
  const policy = active
  const dispatcher = installed
  if (policy === undefined || dispatcher === undefined) return DIRECT_ROUTE
  const proxy = proxyForUrl(policy, url)
  return proxy === undefined ? DIRECT_ROUTE : { proxied: true, proxy, dispatcher }
}

function applyPolicyEnv(policy) {
  const previousInherited = inheritedProxyEnv
  inheritedProxyEnv = previousInherited ?? snapshotProxyEnv()
  const published = {}
  for (const [field, names] of Object.entries(POLICY_ENV_NAMES)) {
    const value = policy[field]
    for (const name of names) published[name] = value
  }
  const restore = writeProxyEnv(published)
  return () => {
    restore()
    inheritedProxyEnv = previousInherited
  }
}

function snapshotProxyEnv() {
  const snapshot = {}
  for (const names of Object.values(POLICY_ENV_NAMES)) {
    for (const name of names) snapshot[name] = process.env[name]
  }
  return snapshot
}

function writeProxyEnv(values) {
  const previous = snapshotProxyEnv()
  for (const name of Object.keys(previous)) {
    const value = values[name]
    if (value === undefined) Reflect.deleteProperty(process.env, name)
    else process.env[name] = value
  }
  return () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) Reflect.deleteProperty(process.env, name)
      else process.env[name] = value
    }
  }
}

async function createPolicyDispatcher(policy) {
  const { Agent, Pool, ProxyAgent } = await import('undici')
  return new Agent({
    factory(origin, options) {
      const proxy = proxyForUrl(policy, new URL(origin.toString()))
      if (proxy !== undefined) return new ProxyAgent({ ...options, uri: proxy })
      return new Pool(origin, options)
    },
  })
}

async function installGlobalProxy(policy) {
  const previousPolicy = active
  if (policy.source === 'none') {
    if (previousPolicy === undefined) {
      active = policy
      return () => {
        active = previousPolicy
        return Promise.resolve()
      }
    }
    const previousInstalled = installed
    const restoreEnv = inheritedProxyEnv === undefined ? undefined : writeProxyEnv(inheritedProxyEnv)
    const undici = await import('undici')
    const previous = undici.getGlobalDispatcher()
    const direct = new undici.Agent()
    undici.setGlobalDispatcher(direct)
    active = policy
    installed = undefined
    return async () => {
      undici.setGlobalDispatcher(previous)
      active = previousPolicy
      installed = previousInstalled
      restoreEnv?.()
      await direct.close()
    }
  }
  const restoreEnv = applyPolicyEnv(policy)
  const { getGlobalDispatcher, setGlobalDispatcher } = await import('undici')
  const previousDispatcher = getGlobalDispatcher()
  const previousInstalled = installed
  const agent = await createPolicyDispatcher(policy)
  setGlobalDispatcher(agent)
  active = policy
  installed = agent
  return async () => {
    setGlobalDispatcher(previousDispatcher)
    active = previousPolicy
    installed = previousInstalled
    restoreEnv()
    await agent.close()
  }
}

export function proxyEnvironmentForChild() {
  const policy = active
  const inherited = inheritedProxyEnv
  if (policy === undefined || policy.source === 'none' || inherited === undefined) return {}
  const overlay = { NODE_USE_ENV_PROXY: '1' }
  for (const [field, names] of Object.entries(POLICY_ENV_NAMES)) {
    const resolved = policy[field]
    const named = field !== 'noProxy' && names.some(name => inherited[name] !== undefined)
    for (const name of names) overlay[name] = named ? inherited[name] : resolved
  }
  const parsedByNode = [...POLICY_ENV_NAMES.httpProxy, ...POLICY_ENV_NAMES.httpsProxy]
  if (parsedByNode.some(name => overlay[name] !== undefined && !isSupportedProxyUrl(overlay[name]))) {
    delete overlay.NODE_USE_ENV_PROXY
  }
  return overlay
}

export async function installProxyFromEnvironment(env, report) {
  const { policy, diagnostics } = resolveProxyPolicy(env)
  for (const diagnostic of diagnostics) report(diagnostic.message)
  return await installGlobalProxy(policy)
}

export function clearedProxyEnv() {
  return Object.fromEntries(PROXY_ENV_NAMES.map(name => [name, undefined]))
}
