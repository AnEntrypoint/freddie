/**
 * Scoped MCP resource providers and the shared model-facing resource tools.
 * @module @freddie/freddie-mcp-resources
 */

import { Service } from '@freddie/cordis'
import { createScope, NamedEntries, ScopedLayers, scopeOf } from '@freddie/freddie-scope'
import { registerResourceTools } from './tools.js'

/**
 * @typedef {{ method: 'resources/list' | 'resources/templates/list', cursor?: string }
 *   | { method: 'resources/read', uri: string }} McpResourceRequest
 */

/**
 * One configured server's resource access, owned by its MCP connection plugin.
 * @typedef {object} McpResourceProvider
 * @property {(request: McpResourceRequest, exec: import('@freddie/freddie-tools').ToolExecution) => Promise<unknown>} request -
 *   Run an operation against one live connection generation.
 */

/** The order this section sits at among freddie's own tool-usage-guidance sections. */
const MCP_SERVERS_SECTION_ORDER = 115

class ResourceLayer {
  servers = new NamedEntries(name =>
    new Error(`MCP resource server "${name}" is already registered in this scope`))

  /** @type {(() => void | Promise<void>) | undefined} */
  disposeTools

  isEmpty() {
    return this.servers.isEmpty()
  }
}

/** Scoped resource access plus three tools shared by configured MCP servers. */
export class McpResourceRuntime extends Service {
  /** Tool registry required by the resource consumer. */
  static inject = ['tools']

  layers = new ScopedLayers(() => new ResourceLayer(), () => undefined)

  constructor(ctx) {
    super(ctx, 'mcpResources')
    /** Shared tool registrations outlive any one server's registering context. */
    this.selfCtx = ctx

    ctx.inject(['systemPrompt'], (inner) => {
      inner.systemPrompt.section({
        name: 'mcp-resource-servers',
        order: MCP_SERVERS_SECTION_ORDER,
        interpolate: false,
        text: ({ scope }) => {
          const names = [...this.layers.merge(scope, layer => layer.servers).keys()].sort()
          return names.length === 0 ? '' : '## MCP resource servers\n\n'
            + 'Use list_mcp_resources, list_mcp_resource_templates, or read_mcp_resource with one of these names '
            + `as the server argument: ${JSON.stringify(names)}.`
        },
      })
    })
  }

  /**
   * Register one server and expose resource tools while that scope has providers.
   * @param server - configured server name, unique in this scope.
   * @param provider - connection-owned resource operations.
   * @returns the effect disposer for this exact registration.
   */
  register(server, provider) {
    const ctx = this.ctx
    const scope = scopeOf(ctx)
    const dispose = ctx.effect(function* () {
      let disposal
      yield () => disposal
      yield this.layers.effect(ctx, (layer) => {
        const first = layer.servers.isEmpty()
        const remove = layer.servers.insert(server, provider)
        try {
          if (first) layer.disposeTools = this.registerTools(scope)
        } catch (error) {
          remove()
          throw error
        }
        return () => {
          remove()
          if (layer.servers.isEmpty()) disposal = layer.disposeTools()
        }
      }, { label: `mcpResources.provider(${server})` })
    }.bind(this), `mcpResources.register(${server})`)
    return dispose
  }

  /**
   * Own one scope's tools independently of its configured server plugins.
   * @param scope - the scope key whose tools this owns, or `undefined` for the global scope.
   * @returns the effect disposer for the owned tool registrations.
   */
  registerTools(scope) {
    const ctx = this.selfCtx
    return ctx.effect(function* () {
      let toolCtx = ctx
      if (scope !== undefined) {
        const owned = createScope(ctx, scope)
        yield owned.rawDispose
        toolCtx = owned.ctx
      }
      yield registerResourceTools(toolCtx, (server, request, exec) => this.request(server, request, exec))
    }.bind(this), 'mcpResources.tools')
  }

  /**
   * Resolve the caller-visible server before starting any network operation.
   * @param server - configured server name.
   * @param request - the resource operation to run.
   * @param exec - caller identity and cancellation for this invocation.
   * @returns the provider's result.
   */
  request(server, request, exec) {
    const provider = this.layers.merge(exec.agent, layer => layer.servers).get(server)
    if (!provider) throw new Error(`MCP resource server "${server}" is unavailable in this agent's scope`)
    return provider.request(request, exec)
  }
}

export default McpResourceRuntime
