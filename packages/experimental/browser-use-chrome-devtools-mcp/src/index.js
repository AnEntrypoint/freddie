/**
 * Chromium inspection and automation through the pinned Chrome DevTools MCP
 * server.
 * @module @freddie/freddie-experimental-browser-use-chrome-devtools-mcp
 */

import { existsSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import Schema from '@freddie/schemastery'
import {
  BrowserMcpConfig,
  mountSessionMcp,
  validateBrowserMcpConfig,
} from '@freddie/freddie-experimental-browser-use-runtime/mcp'

/**
 * Upstream MCP server version this provider's launch arguments and tool
 * catalog were verified against. It is an exact-pinned optional dependency of
 * this package, installed without lifecycle scripts.
 */
export const PINNED_SERVER_VERSION = '1.9.0'

/** Pinned npm entry started under the current Node executable. */
const SERVER_ENTRY = 'chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'

/** Cordis identity for the Chrome DevTools MCP browser provider. */
export const name = 'experimental-browser-use-chrome-devtools-mcp'

/** Services required for scoped MCP startup and prompt readiness checks. */
export const inject = ['browserUse', 'agents', 'tools', 'systemPrompt']

/**
 * Environment switch the upstream server reads to skip its npm registry update
 * check, which would otherwise spawn a detached process and write a cache file
 * under the user's home. Statistics and CrUX lookups have launch flags instead.
 */
const QUIET_SERVER_ENV = Object.freeze({ CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1' })

/**
 * Server flags that close every outbound request the upstream server makes on
 * its own: usage statistics, CrUX lookups for performance traces, and DevTools
 * source-map fetches from page-supplied URLs.
 */
const QUIET_SERVER_ARGS = Object.freeze(['--no-usage-statistics', '--no-performance-crux', '--no-source-maps'])

/**
 * Hosts a launched Chrome contacts for its own upkeep (component updater and
 * its downloads, GCM registration, time sync, CSP reports, variations, Safe
 * Browsing and autofill services). No page the model browses needs them, so a
 * launched browser resolves them to nothing.
 */
const CHROME_INTERNAL_HOSTS = Object.freeze([
  'update.googleapis.com',
  '*.gvt1.com',
  'android.clients.google.com',
  'mtalk.google.com',
  'clients2.google.com',
  'csp.withgoogle.com',
  'optimizationguide-pa.googleapis.com',
  'clientservices.googleapis.com',
  'safebrowsing.googleapis.com',
  'content-autofill.googleapis.com',
])

/** Chrome switch that resolves {@link CHROME_INTERNAL_HOSTS} to nothing. */
const CHROME_INTERNAL_HOST_RULES = `--host-resolver-rules=${CHROME_INTERNAL_HOSTS.map(host => `MAP ${host} ~NOTFOUND`).join(', ')}`

/**
 * Overrides merged onto the shared launch or attachment settings.
 * @typedef {object} BrowserEntryConfig
 * @property {string} [entryPath] - explicit path to the pinned
 *   `chrome-devtools-mcp` CLI entry; omission resolves it from the Node
 *   module resolution of this package.
 * @property {string[]} [excludePresets] - agent preset ids whose agents get no
 *   MCP server and no browser tools; omission serves every agent.
 */

/** Fixed Chromium launch or existing-browser attachment settings. */
/** @typedef {BrowserMcpConfig & BrowserEntryConfig} Config */

/** Validate the launch or attachment configuration before activation. */
export const Config = Schema.intersect([
  BrowserMcpConfig,
  Schema.object({
    entryPath: Schema.string().pattern(/\S/u),
    excludePresets: Schema.array(Schema.string().pattern(/\S/u)).default([]),
  }),
])

/**
 * Locate the pinned server entry. An explicit path must exist; an entry that
 * module resolution cannot find is reported as absent rather than as a failure.
 * @param {string} [entryPath] - deployment-supplied absolute or cwd-relative
 *   path to the entry.
 * @returns {string | undefined} the entry path passed to the child process, or
 *   `undefined` when the optional dependency is not installed.
 */
function resolveServerEntry(entryPath) {
  if (entryPath !== undefined) {
    const explicit = resolvePath(entryPath)
    if (!existsSync(explicit)) {
      throw new Error(`chrome-devtools-mcp entryPath "${explicit}" does not exist; install chrome-devtools-mcp@${PINNED_SERVER_VERSION} and point entryPath at its build/src/bin/chrome-devtools-mcp.js`)
    }
    return explicit
  }
  try {
    return fileURLToPath(import.meta.resolve(SERVER_ENTRY))
  } catch {
    return undefined
  }
}

/**
 * Expose Chrome DevTools' upstream catalog through one MCP process per live
 * Session. Attached browsers remain externally owned; the server runs with
 * usage statistics, CrUX lookups, source-map fetches, and update checks
 * disabled, and a launched Chrome resolves its own upkeep hosts to nothing. The child
 * inherits only the MCP client's scrubbed ambient environment plus
 * {@link QUIET_SERVER_ENV}, so no credential reachable from the parent process
 * is forwarded to it. A missing optional server logs one
 * warning and leaves the provider inert; a bad explicit `entryPath` or
 * configuration throws.
 * @param {import('@freddie/cordis').Context} ctx - provider context supplying
 *   browser use, Agents, and tools.
 * @param {Config} config - validated browser choice and optional tool timeout.
 * @returns {void}
 */
export function apply(ctx, config) {
  validateBrowserMcpConfig(config)
  const cli = resolveServerEntry(config.entryPath)
  if (cli === undefined) {
    ctx.logger.warn(`chrome-devtools-mcp@${PINNED_SERVER_VERSION} is not installed next to this package; browser tools are disabled. Install it or set \`entryPath\` to its build/src/bin/chrome-devtools-mcp.js`)
    return
  }
  const args = [cli, ...QUIET_SERVER_ARGS]
  if (config.mode === 'attach') {
    args.push(/^wss?:/u.test(config.endpoint) ? '--ws-endpoint' : '--browser-url', config.endpoint)
  } else {
    args.push('--isolated', `--headless=${String(config.headless)}`, `--chrome-arg=${CHROME_INTERNAL_HOST_RULES}`)
    if (config.executablePath !== undefined) args.push('--executable-path', config.executablePath)
  }
  const excluded = new Set(config.excludePresets ?? [])
  const excludeAgent = (agent) => {
    const preset = ctx.get('agentPresets')?.composedPreset(agent.ctx)
    return preset !== undefined && excluded.has(preset)
  }
  mountSessionMcp(ctx, {
    name: 'chrome-devtools-mcp',
    exclusive: config.mode === 'attach',
    command: process.execPath,
    args,
    env: { ...QUIET_SERVER_ENV },
    ...excluded.size === 0 ? {} : { excludeAgent },
    ...config.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: config.toolCallTimeoutMs },
  })
}
