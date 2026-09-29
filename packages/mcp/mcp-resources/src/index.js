import { Service } from '@freddie/cordis'
import { createScope, NamedEntries, ScopedLayers, scopeOf } from '@freddie/freddie-scope'
import { registerResourceTools } from './tools.js'

const MCP_SERVERS_SECTION_ORDER = 115

class ResourceLayer {
  servers = new NamedEntries(name =>
    new Error(`MCP resource server "${name}" is already registered in this scope`))

  disposeTools

  isEmpty() {
    return this.servers.isEmpty()
  }
}

export class McpResourceRuntime extends Service {
  static inject = ['tools']

  layers = new ScopedLayers(() => new ResourceLayer(), () => undefined)

  constructor(ctx) {
    super(ctx, 'mcpResources')
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

  request(server, request, exec) {
    const provider = this.layers.merge(exec.agent, layer => layer.servers).get(server)
    if (!provider) throw new Error(`MCP resource server "${server}" is unavailable in this agent's scope`)
    return provider.request(request, exec)
  }
}

export default McpResourceRuntime
