import Schema from '@freddie/schemastery'
import { BrowserUseProviderName } from '@freddie/freddie-browser-use/brand'
import * as McpClient from '@freddie/freddie-mcp-client'
import { createScope } from '@freddie/freddie-scope'
import { SessionResources } from './index.js'






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

function untilDiscoveredOrAborted(discovery, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    signal.addEventListener('abort', () => { resolve() }, { once: true })
    void discovery.then(() => { resolve() })
  })
}

export function mountSessionMcp(ctx, options) {
  let resources
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
