import { defineTool } from '@freddie/freddie-tools'
import { assertNever } from '@freddie/freddie-llm'

export const name = 'tool-subagent-list-agents'
export const inject = ['tools', 'subagents', 'agents']

function resolveListAgentsRequest(request) {
  return { scope: request.scope ?? 'children' }
}

function statusOf(agents, id) {
  const agent = agents.get(id)
  if (agent === undefined) return 'ready'
  return agent.status === 'running' ? 'running' : 'idle'
}

function project(agents, entry, position) {
  const at = position === undefined ? {} : { parent: position.parentId, depth: position.depth }
  if (entry.kind === 'diagnostic') {
    return { kind: 'diagnostic', id: entry.id, reason: entry.reason, ...at }
  }
  if (entry.mode !== 'continuable') return undefined
  return {
    kind: 'child',
    id: entry.id,
    label: entry.label,
    status: statusOf(agents, entry.id),
    ...at,
  }
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'list_agents',
    description:
      'List your continuable background subagents by durable id and label. Use it to recall which ones '
      + 'you started, not to poll for completion — you are told when one finishes. Status comes from the live '
      + 'registry: running means the agent is working right now, idle means it is loaded but between turns '
      + '(it may be waiting on agents it started), and ready means it exists only in storage — resumable, not '
      + 'terminal, and not a result waiting to be collected; a `send_message` starts a new turn on the same '
      + 'conversation, and a direct child remains a `send_message` candidate in every status. The snapshot is not a delivery '
      + 'promise — `send_message` performs the authoritative check and may still fail. Children that could '
      + 'not be read are reported as diagnostics instead of being silently dropped. Scope `descendants` '
      + 'walks the whole tree below you in stable pre-order, annotating each entry with its durable direct-parent '
      + 'session id and depth. You may use `send_message` only for depth-1 entries; deeper entries are '
      + 'candidates for `interrupt_agent` only.',
    parameters: {
      scope: {
        type: 'string',
        enum: ['children', 'descendants'],
        description: 'children (default) lists direct children only; descendants walks the complete tree below you.',
      },
    },
    output: {
      schema: {
        type: 'array',
        items: {
          oneOf: [
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', required: true, enum: ['child'] },
                id: { type: 'string', required: true },
                label: { type: 'string', required: true },
                status: { type: 'string', required: true, enum: ['running', 'idle', 'ready'] },
                parent: { type: 'string' },
                depth: { type: 'number' },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', required: true, enum: ['diagnostic'] },
                id: { type: 'string', required: true },
                reason: { type: 'string', required: true, enum: ['corrupt', 'unsupported', 'unavailable'] },
                parent: { type: 'string' },
                depth: { type: 'number' },
              },
            },
          ],
        },
      },
      render: (args, entries) => {
        const request = resolveListAgentsRequest(args)
        return [{
          type: 'text',
          text: entries.length === 0
            ? '(no subagents)'
            : entries.map((entry) => {
              const at = request.scope === 'descendants'
                ? ` parent=${String(entry.parent)} depth=${String(entry.depth)}`
                : ''
              return entry.kind === 'child'
                ? `${entry.id} [${entry.status}]${at} — ${entry.label}`
                : `${entry.id} [diagnostic: ${entry.reason}]${at}`
            }).join('\n'),
        }]
      },
    },
    async execute(args, exec) {
      const parent = exec.agent
      if (!parent) {
        throw new Error('list_agents requires a calling agent (exec.agent was undefined)')
      }
      const request = resolveListAgentsRequest(args)
      switch (request.scope) {
        case 'children': {
          const entries = await ctx.subagents.listChildren(parent.id, exec.signal)
          return entries
            .map(entry => project(ctx.agents, entry))
            .filter(entry => entry !== undefined)
        }
        case 'descendants': {
          const entries = await ctx.subagents.listDescendants(parent.id, exec.signal)
          return entries
            .map(entry => project(ctx.agents, entry, entry))
            .filter(entry => entry !== undefined)
        }
        /* v8 ignore next 2 -- the resolver normalizes the schema-validated closed scope before dispatch. */
        default:
          return assertNever(request.scope, 'list_agents scope')
      }
    },
  }))
}
