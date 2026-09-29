/**
 * Proxy policy resolution: the pure, transport-free half of this package. It turns the launch
 * environment into one {@link ProxyPolicy}, and answers which proxy
 * (if any) a given URL goes through.
 *
 * Nothing here imports `undici`, so the module stays loadable in a runtime with no Node transport.
 *
 * @typedef {object} EnvLookup
 * @property {function(string): ({ readonly value: string } | undefined)} get
 *   The one thing resolution needs from an environment: a name in, the winning value out. The
 *   launcher's snapshot satisfies this structurally, matching `@freddie/freddie-launch-environment`.
 * @typedef {{ readonly httpProxy?: string; readonly httpsProxy?: string; readonly noProxy: string; readonly source: 'env' | 'none' }} ProxyPolicy
 *   One resolved outbound proxy policy. Plain data with no methods: a worker thread receives it
 *   through `workerData`'s structured clone, so both sides run the identical policy rather than each
 *   re-reading an environment they may not share.
 * @typedef {{ readonly kind: 'socks' | 'invalid'; readonly origin: string; readonly message: string }} ProxyDiagnostic
 *   Why one candidate proxy value was not used. Callers decide whether this warns or fails the load.
 * @typedef {{ readonly policy: ProxyPolicy; readonly diagnostics: readonly ProxyDiagnostic[] }} ProxyResolution
 *   A resolved policy plus every candidate value that was rejected on the way to it.
 */

export const LOOPBACK_NO_PROXY = ['localhost', '127.0.0.1', '::1', '[::1]']

export const POLICY_ENV_NAMES = {
  httpProxy: ['http_proxy', 'HTTP_PROXY'],
  httpsProxy: ['https_proxy', 'HTTPS_PROXY'],
  noProxy: ['no_proxy', 'NO_PROXY'],
}

export const PROXY_ENV_NAMES = [
  ...Object.values(POLICY_ENV_NAMES).flat(),
  'all_proxy',
  'ALL_PROXY',
]

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:'])

const SOCKS_PROTOCOLS = new Set(['socks:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'])

export const DIRECT_POLICY = { noProxy: '', source: 'none' }

const ABSENT = { kind: 'absent' }

/**
 * Read one environment name in undici's precedence order — lowercase first, uppercase as the
 * fallback — treating a blank value as unset. Blank matters: undici's own `??` chain lets an empty
 * lowercase name shadow a populated uppercase one.
 *
 * @param {EnvLookup} env - the launch environment snapshot to read.
 * @param {string} lower - the lowercase variable name.
 * @returns {{ value: string; name: string } | undefined} the trimmed value and the name that supplied it, or `undefined` when neither is set.
 */
function readEnv(env, lower) {
  for (const name of [lower, lower.toUpperCase()]) {
    const value = env.get(name)?.value.trim()
    if (value !== undefined && value !== '') return { value, name }
  }
  return undefined
}

/**
 * Validate one candidate proxy URL.
 *
 * @param {{ value: string; name: string } | undefined} candidate - the raw value and the origin to name in a diagnostic.
 * @param {ProxyDiagnostic[]} diagnostics - collector the rejection is appended to.
 * @returns {{ kind: 'accepted'; value: string } | { kind: 'rejected' } | { kind: 'absent' }} the candidate's usability, distinguishing a rejected slot from an empty one.
 */
function acceptProxyUrl(candidate, diagnostics) {
  if (candidate === undefined) return ABSENT
  const parsed = URL.parse(candidate.value)
  if (parsed === null) {
    diagnostics.push({
      kind: 'invalid',
      origin: candidate.name,
      message: `${candidate.name} is not a valid URL; connecting directly`,
    })
    return { kind: 'rejected' }
  }
  if (SOCKS_PROTOCOLS.has(parsed.protocol)) {
    diagnostics.push({
      kind: 'socks',
      origin: candidate.name,
      message: `${candidate.name} names a SOCKS proxy, which is not supported; connecting directly for that scheme — set an http:// or https:// proxy URL instead`,
    })
    return { kind: 'rejected' }
  }
  if (!SUPPORTED_PROTOCOLS.has(parsed.protocol)) {
    diagnostics.push({
      kind: 'invalid',
      origin: candidate.name,
      message: `${candidate.name} uses the unsupported ${parsed.protocol}// scheme; connecting directly for that scheme — set an http:// or https:// proxy URL instead`,
    })
    return { kind: 'rejected' }
  }
  return { kind: 'accepted', value: candidate.value }
}

/**
 * Whether a proxy URL is one this package accepts: parseable, with an `http:` or `https:` scheme.
 * The same test {@link acceptProxyUrl} applies, without its diagnostics.
 *
 * @param {string} value - the proxy URL as an environment variable holds it.
 * @returns {boolean} true when the URL would be accepted.
 */
export function isSupportedProxyUrl(value) {
  const parsed = URL.parse(value)
  return parsed !== null && SUPPORTED_PROTOCOLS.has(parsed.protocol)
}

/**
 * Resolve one scheme's proxy from its own slot, then the fallbacks — but only when the scheme's own
 * slot was empty. A rejected slot keeps that scheme direct, so the diagnostic and the route agree.
 *
 * @param {{ kind: string; value?: string }} own - what the scheme's own name supplied.
 * @param {...(string | undefined)} fallbacks - values to try in order when `own` is absent.
 * @returns {string | undefined} the proxy URL for that scheme, or `undefined` for a direct connection.
 */
function resolveScheme(own, ...fallbacks) {
  if (own.kind === 'accepted') return own.value
  if (own.kind === 'rejected') return undefined
  return fallbacks.find(value => value !== undefined)
}

/**
 * Merge {@link LOOPBACK_NO_PROXY} into a bypass list, preserving the caller's entries and order.
 * A list of `*` already bypasses everything and is returned unchanged.
 *
 * @param {string | undefined} noProxy - the bypass list as the environment supplied it.
 * @returns {string} the effective bypass list.
 */
function withLoopback(noProxy) {
  const entries = (noProxy ?? '').split(/[,\s]+/).map(entry => entry.trim()).filter(entry => entry !== '')
  if (entries.includes('*')) return '*'
  const present = new Set(entries.map(entry => entry.toLowerCase()))
  return [...entries, ...LOOPBACK_NO_PROXY.filter(entry => !present.has(entry))].join(',')
}

/**
 * Split one bypass entry into host and optional port.
 *
 * A bare IPv6 literal carries several colons and no port, so only a single-colon entry splits;
 * a bracketed literal takes its port from after the bracket. Getting this wrong is how undici
 * turns `::1` into host `:` port `1`.
 *
 * @param {string} entry - one already-trimmed bypass entry.
 * @returns {{ host: string; port?: string }} the entry's host and, when it carries one, its port.
 */
function splitHostPort(entry) {
  if (entry.startsWith('[')) {
    const close = entry.indexOf(']')
    if (close !== -1) {
      const rest = entry.slice(close + 1)
      const host = entry.slice(1, close)
      return rest.startsWith(':') ? { host, port: rest.slice(1) } : { host }
    }
  }
  const colon = entry.indexOf(':')
  if (colon !== -1 && entry.indexOf(':', colon + 1) === -1) {
    return { host: entry.slice(0, colon), port: entry.slice(colon + 1) }
  }
  return { host: entry }
}

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'

const LOOPBACK_IPV4 = new RegExp(`^127\\.${OCTET}\\.${OCTET}\\.${OCTET}$`)

/**
 * Whether a host names this machine.
 *
 * A proxy cannot meaningfully reach one: it would resolve the address in its own network, and a
 * proxy running on this machine would reach a service that only listens on loopback. The bypass
 * list carries {@link LOOPBACK_NO_PROXY} for the consumers that read an environment rather than a
 * policy, but those are four literal entries — matching them alone leaves `127.0.0.2`, the whole
 * rest of `127.0.0.0/8`, and the IPv4-mapped spelling routed through the proxy.
 *
 * @param {string} hostname - a URL's hostname, bracketed or not.
 * @returns {boolean} true when the host is loopback or the unspecified address.
 */
export function isLoopbackHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host === '::' || host === '0.0.0.0') return true
  const mappedHigh = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(host)?.[1]
  if (mappedHigh !== undefined) return Number.parseInt(mappedHigh, 16) >>> 8 === 127
  return LOOPBACK_IPV4.test(host.startsWith('::ffff:') ? host.slice('::ffff:'.length) : host)
}

/**
 * Decide whether a bypass list exempts one URL. An entry names a host and matches it together with
 * every subdomain under it — `example.com` also bypasses `api.example.com` — and a leading `.` or
 * `*.` is accepted as the same thing; an entry may carry a `:port`, and `*` bypasses everything.
 * CIDR notation is not matched —
 * an operating system's bypass list often carries `10.0.0.0/8`, which must be rewritten as suffixes.
 *
 * @param {string} noProxy - the effective bypass list.
 * @param {URL} url - the request URL.
 * @returns {boolean} true when the URL must bypass the proxy.
 */
export function bypassesProxy(noProxy, url) {
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  const port = url.port !== '' ? url.port : url.protocol === 'https:' ? '443' : '80'
  for (const raw of noProxy.split(/[,\s]+/)) {
    const entry = raw.trim().toLowerCase()
    if (entry === '') continue
    if (entry === '*') return true
    const split = splitHostPort(entry)
    if (split.port !== undefined && split.port !== port) continue
    const candidate = split.host.replace(/^\*?\./, '').replace(/\.$/, '')
    if (candidate === '') continue
    if (host === candidate || host.endsWith(`.${candidate}`)) return true
  }
  return false
}

/**
 * Resolve the outbound proxy policy for this process.
 *
 * A scheme's own variable wins, then `ALL_PROXY`, then — for HTTPS only — the HTTP proxy, matching
 * undici so this function and the installed dispatcher never disagree about one URL.
 *
 * @param {EnvLookup} env - the launch environment, whose own layering already prefers real variables over `.env` files.
 * @returns {ProxyResolution} the policy to install plus every rejected candidate.
 */
export function resolveProxyPolicy(env) {
  const diagnostics = []
  const all = acceptProxyUrl(readEnv(env, 'all_proxy'), diagnostics)
  const allValue = all.kind === 'accepted' ? all.value : undefined
  const envHttp = acceptProxyUrl(readEnv(env, 'http_proxy'), diagnostics)
  const envHttps = acceptProxyUrl(readEnv(env, 'https_proxy'), diagnostics)
  const httpProxy = resolveScheme(envHttp, allValue)
  const httpsProxy = resolveScheme(envHttps, allValue, httpProxy)
  if (httpProxy === undefined && httpsProxy === undefined) return { policy: DIRECT_POLICY, diagnostics }
  return {
    policy: {
      ...httpProxy === undefined ? {} : { httpProxy },
      ...httpsProxy === undefined ? {} : { httpsProxy },
      noProxy: withLoopback(readEnv(env, 'no_proxy')?.value),
      source: 'env',
    },
    diagnostics,
  }
}

/**
 * Resolve which proxy one URL goes through under a policy.
 *
 * This is the single answer both the installed dispatcher and any direct caller consult, so a URL
 * can never be pinned to a resolved address by one and tunnelled by the other.
 *
 * @param {ProxyPolicy} policy - the active policy.
 * @param {URL} url - the request URL.
 * @returns {string | undefined} the proxy URL to tunnel through, or `undefined` for a direct connection.
 */
export function proxyForUrl(policy, url) {
  const proxy = url.protocol === 'https:' ? policy.httpsProxy : url.protocol === 'http:' ? policy.httpProxy : undefined
  if (proxy === undefined) return undefined
  if (isLoopbackHost(url.hostname)) return undefined
  return bypassesProxy(policy.noProxy, url) ? undefined : proxy
}
