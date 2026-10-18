import { join } from 'node:path'
import z from '@freddie/schemastery'
import * as acp from '@freddie/freddie-acp'
import * as agentCore from '@freddie/freddie-agent-spine-demo'
import * as workspaceContext from '@freddie/freddie-agent-instructions'
import ToolRuntime from '@freddie/freddie-tools'
import JsonlSessionPersistence, {
  JsonlCompressionSchema,
} from '@freddie/freddie-session-persistence-jsonl'
import * as sessionCheckpointPolicy from '@freddie/freddie-session-checkpoint-policy'
import SqliteSessionQueryEngine from '@freddie/freddie-session-query-sqlite'

export const name = 'acp-demo'
const DEFAULT_PERSISTENCE_ROOT = './.sessions'

export const Config = z.object({
  provider: z.string().required(),
  model: z.string().required(),
  maxParallelToolCalls: z.number().step(1).min(1),
  persona: z.string(),
  toolOrder: z.array(z.string()).default(undefined),
  tools: ToolRuntime.Config,
  freddieHome: z.string(),
  sessionTitle: agentCore.SessionTitleConfigSchema,
  persistenceRoot: z.string().default(DEFAULT_PERSISTENCE_ROOT),
  packChunks: z.boolean().default(true),
  persistenceCompression: JsonlCompressionSchema,
  workspaceContext: z.union([z.const(false), workspaceContext.Config]).required(),
  skills: agentCore.SkillConfigSchema,
  toolBash: agentCore.ToolBashConfigSchema,
  jobs: agentCore.JobsConfigSchema,
  toolJobs: z.union([z.const(false), agentCore.ToolJobsConfigSchema]),
  goals: z.union([z.const(false), agentCore.GoalConfigSchema]),
})

export async function apply(ctx, config) {
  const goals = config.goals ?? {}
  const persistenceRoot = config.persistenceRoot ?? DEFAULT_PERSISTENCE_ROOT
  await ctx.effect(async function* () {
    const spine = ctx.plugin(agentCore, { ...agentCore.pickSpineConfig(config), goals })
    await spine
    yield spine.dispose
    const persistence = ctx.plugin(JsonlSessionPersistence, {
      root: persistenceRoot,
      ...config.packChunks !== undefined ? { packChunks: config.packChunks } : {},
      ...(config.persistenceCompression === undefined ? {} : { compression: config.persistenceCompression }),
    })
    await persistence
    yield persistence.dispose
    const checkpoint = ctx.plugin(sessionCheckpointPolicy)
    await checkpoint
    yield checkpoint.dispose
    const query = ctx.plugin(SqliteSessionQueryEngine, { path: join(persistenceRoot, 'session-query.db') })
    await query
    yield query.dispose
    const transport = ctx.plugin(acp, { provider: config.provider, model: config.model })
    await transport
    yield transport.dispose
  }, 'acp-demo.composition')
}
