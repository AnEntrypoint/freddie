/**
 * Session-owned MCP browser processes and provider catalog activation.
 * @module @freddie/freddie-experimental-browser-use-runtime/mcp
 */

import Schema from '@freddie/schemastery'
import { BrowserUseProviderName } from '@freddie/freddie-browser-use/brand'
import * as McpClient from '@freddie/freddie-mcp-client'
import { createScope } from '@freddie/freddie-scope'
import { SessionResources } from './index.js'

/**
 * Browser launch settings shared by the MCP integrations.
 * @typedef {object} BrowserMcpLaunchConfig
 * @property {'launch'} mode - launch a new isolated Chromium browser for each
 *   live Session.
 * @property {boolean} headless - whether Chromium runs without a visible window.
 * @property {string} [executablePath] - Chromium executable; omission uses the
 *   upstream server's installation discovery.
 * @property {number} [toolCallTimeoutMs] - per-call timeout override in
 *   milliseconds; omission uses the MCP client default.
 */

/**
 * Attachment to an externally owned Chromium browser.
 * @typedef {object} BrowserMcpAttachConfig
 * @property {'attach'} mode - exclusively attach one live Session to the
 *   configured browser.
 * @property {string} endpoint - HTTP(S) debugging URL or WS(S) browser
 *   debugging endpoint.
 * @property {number} [toolCallTimeoutMs] - per-call timeout override in
 *   milliseconds; omission uses the MCP client default.
 */

/** Fixed launch or attachment choice for one MCP browser provider. */
/** @typedef {BrowserMcpLaunchConfig | BrowserMcpAttachConfig} BrowserMcpConfig */

/**
 * Provider-owned connection options for one live Session.
 * @typedef {object} SessionMcpOptions
 * @property {string} name - provider identity and MCP tool namespace.
 * @property {boolean} exclusive - whether another live Session must wait for
 *   the attached browser to be released.
 * @property {string} command - executable used to start the installed MCP server.
 * @property {string[]} args - arguments passed directly without a shell.
 * @property {Record<string, string>} [env] - explicit overrides merged into the
 *   MCP client's scrubbed child environment.
 * @property {number} [toolCallTimeoutMs] - per-call timeout override; omission
 *   retains the MCP client default.
 * @property {(agent: import('@freddie/freddie-agent').Agent) => boolean} [excludeAgent] -
 *   answers true for an Agent that must get no MCP server, no browser tools, and
 *   no attachment slot; omission serves every Agent.
 */

/**
 * One live Agent's browser-connection state for this provider.
 * @typedef {object} SessionMcpClientState
 * @property {'pending' | 'ready' | 'blocked' | 'failed'} status - whether this
 *   activation owns, is acquiring, was refused, or lost a connection.
 * @property {Promise<void>} [discovery] - the acquisition wait for `pending`.
 * @property {import('@freddie/freddie-scope').Scope} [mask] - tool-mask scope
 *   denying inherited browser tools for a `blocked` activation.
 * @property {unknown} [error] - acquisition failure retained for later callers.
 */

/** Validate the browser mode before the provider reserves browser use. */
export const BrowserMcpConfig = Schema.union([
  Schema.object({
    mode: Schema.const('launch').required(),
    headless: Schema.boolean().default(true),
    executablePath: Schema.string().pattern(/\S/u),
    toolCallTimeoutMs: Schema.number().min(1),
  }),
  Schema.object({
    mode: Schema.const('attach').required(),
    endpoint: Schema.string().pattern(/^https?:\/\/[^/\s]+|^wss?:\/\/[^/\s]+/u).required(),
    toolCallTimeoutMs: Schema.number().min(1),
  }),
])

/**
 * Reject an invalid debugging endpoint before acquiring provider or browser
 * resources.
 * @param {BrowserMcpConfig} config - schema-validated browser selection.
 * @returns {void}
 */
export function validateBrowserMcpConfig(config) {
  if (config.mode !== 'attach') return
  let endpoint
  try {
    endpoint = new URL(config.endpoint)
  } catch (error) {
    throw new Error('browser endpoint must be a valid HTTP(S) or WS(S) URL', { cause: error })
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(endpoint.protocol) || /\s/u.test(config.endpoint)) {
    throw new Error('browser endpoint must be a valid HTTP(S) or WS(S) URL without whitespace')
  }
}

/**
 * Wait for `discovery`, or for `signal` to abort, whichever comes first.
 * @param {Promise<void>} discovery - the acquisition wait, which never rejects.
 * @param {AbortSignal} signal - cancellation of the surrounding maintenance task.
 * @returns {Promise<void>} settles when either side settles.
 */
function untilDiscoveredOrAborted(discovery, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    signal.addEventListener('abort', () => { resolve() }, { once: true })
    void discovery.then(() => { resolve() })
  })
}

/**
 * Await one MCP client for each future Agent. Discovery starts inside
 * `agent/created`. freddie's emitter does not await listener promises and
 * prompt assembly snapshots the tool catalog before any assembly listener runs,
 * so the helper holds the new Agent in a maintenance phase until discovery
 * settles: a waking message sent meanwhile stays in the inbox, and the first
 * model request already carries the complete catalog. A busy attachment leaves
 * that activation without browser tools; its other turns continue. Calls are
 * serialized per Session; unload closes every server before releasing
 * registration.
 * @param {import('@freddie/cordis').Context} ctx - provider context supplying
 *   browser use, Agents, and tools.
 * @param {SessionMcpOptions} options - provider identity, attachment
 *   exclusivity, and executable configuration.
 * @returns {void}
 */
export function mountSessionMcp(ctx, options) {
  /** @type {SessionResources<import('@freddie/freddie-scope').Scope>} */
  let resources
  /** @type {Map<import('@freddie/freddie-agent').Agent, SessionMcpClientState>} */
  const clients = new Map()
  const toolPrefix = `mcp__${options.name}__`
  const resourceTools = new Set(['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'])
  let stopping = false
  let refreshingMasks = false

  const refreshBlockedMasks = () => {
    if (stopping || refreshingMasks) return
    refreshingMasks = true
    try {
      for (const [agent, state] of clients) {
        if (state.status !== 'blocked') continue
        const inherited = ctx.tools.schemas(agent).filter(tool => tool.name.startsWith(toolPrefix))
        if (inherited.length === 0) continue
        state.mask ??= createScope(ctx, agent)
        state.mask.ctx.tools.restrict({ deny: inherited.map(tool => tool.name) })
      }
    } finally {
      refreshingMasks = false
    }
  }

  ctx.effect(function* () {
    yield ctx.browserUse.register(BrowserUseProviderName(options.name))
    resources = new SessionResources(ctx, {
      label: options.name,
      exclusive: options.exclusive,
      async open(agent, signal) {
        const scope = createScope(ctx, agent)
        /** @type {Promise<void> | undefined} */
        let cancellation
        const cancel = () => {
          cancellation = scope.dispose()
        }
        signal.addEventListener('abort', cancel, { once: true })
        try {
          signal.throwIfAborted()
          scope.ctx.on('tools/execute', async (exec, next) => {
            if (!exec.name.startsWith(toolPrefix)) return next()
            if (exec.agent !== agent) {
              if (ctx.tools.get(exec.name, exec.agent) !== ctx.tools.get(exec.name, agent)) return next()
              throw new Error(`${options.name}: browser tool belongs to another Session`)
            }
            return next()
          })
          await scope.ctx.plugin(McpClient, McpClient.Config({
            transport: 'stdio',
            serverName: options.name,
            command: options.command,
            args: options.args,
            ...options.env === undefined ? {} : { env: options.env },
            ...agent.session?.header.cwd === undefined ? {} : { cwd: agent.session.header.cwd },
            ...options.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: options.toolCallTimeoutMs },
            failOnStartupError: true,
            reconnect: { enabled: false },
          }))
          signal.throwIfAborted()
          return {
            value: scope,
            close() {
              clients.delete(agent)
              return scope.dispose()
            },
          }
        } catch (error) {
          await (cancellation ?? scope.dispose())
          throw error
        } finally {
          signal.removeEventListener('abort', cancel)
        }
      },
    })
    yield async () => {
      stopping = true
      await resources.dispose()
      clients.clear()
    }
  }, `${options.name}.sessions`)

  ctx.on('agent/created', async ({ agent }) => {
    if (options.excludeAgent?.(agent) === true) return
    /** @type {SessionMcpClientState} */
    const state = { status: resources.available(agent) ? 'pending' : 'blocked' }
    agent.ctx.effect(() => async () => {
      clients.delete(agent)
      await state.mask?.dispose()
    }, `${options.name}.activation`)
    if (state.status === 'blocked') {
      clients.set(agent, state)
      refreshBlockedMasks()
      return
    }
    clients.set(agent, state)
    state.discovery = resources.get(agent).then(() => {
      if (clients.get(agent) !== state) return
      state.status = 'ready'
      state.discovery = undefined
    }, (error) => {
      ctx.logger.warn(`${options.name}: browser MCP startup failed for Agent "${agent.id}": ${String(error)}`)
      if (clients.get(agent) !== state) return
      state.status = 'failed'
      state.error = error
      state.discovery = undefined
    })
    const discovery = state.discovery
    try {
      void agent.runMaintenance(signal => untilDiscoveredOrAborted(discovery, signal)).catch(() => {})
    } catch (error) {
      ctx.logger.debug(`${options.name}: Agent "${agent.id}" was already active at creation, so its first request may precede the browser catalog: ${String(error)}`)
    }
    await discovery
  }, { prepend: true })

  ctx.on('tools/change', refreshBlockedMasks)

  ctx.on('tools/execute', async (exec, next) => {
    const ownResource = resourceTools.has(exec.name)
      && typeof exec.arguments === 'object' && exec.arguments !== null
      && exec.arguments.server === options.name
    if (!exec.name.startsWith(toolPrefix) && !ownResource) return next()
    const agent = exec.agent
    const state = agent === undefined ? undefined : clients.get(agent)
    if (state === undefined || state.status === 'blocked') {
      throw new Error(`${options.name}: browser tool belongs to another Session`)
    }
    if (state.status === 'failed') {
      throw new Error(`${options.name}: browser MCP server is not available for this Session`, { cause: state.error })
    }
    if (state.status === 'pending') await state.discovery
    return resources.run(agent, exec.signal, async (_scope, combined) => {
      const original = exec.signal
      exec.signal = combined
      try {
        return await next()
      } finally {
        exec.signal = original
      }
    })
  })
}
