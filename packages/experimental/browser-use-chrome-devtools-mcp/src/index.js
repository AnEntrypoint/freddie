import { existsSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'
import Schema from '@freddie/schemastery'
import {
  BrowserMcpConfig,
  mountSessionMcp,
  validateBrowserMcpConfig,
} from '@freddie/freddie-experimental-browser-use-runtime/mcp'

export const PINNED_SERVER_VERSION = '1.9.0'

const SERVER_ENTRY = 'chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js'

export const name = 'experimental-browser-use-chrome-devtools-mcp'

export const inject = ['browserUse', 'agents', 'tools', 'systemPrompt']

const QUIET_SERVER_ENV = Object.freeze({ CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1' })

const QUIET_SERVER_ARGS = Object.freeze(['--no-usage-statistics', '--no-performance-crux', '--no-source-maps'])

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

const CHROME_INTERNAL_HOST_RULES = `--host-resolver-rules=${CHROME_INTERNAL_HOSTS.map(host => `MAP ${host} ~NOTFOUND`).join(', ')}`



export const Config = Schema.intersect([
  BrowserMcpConfig,
  Schema.object({
    entryPath: Schema.string().pattern(/\S/u),
    excludePresets: Schema.array(Schema.string().pattern(/\S/u)).default([]),
  }),
])

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
