import Timer from '@freddie/cordis-plugin-timer'
import z from '@freddie/schemastery'
import LlmRuntime from '@freddie/freddie-llm'
import SessionStore from '@freddie/freddie-session'
import SessionTitleService from '@freddie/freddie-session-title'
import SystemPrompt from '@freddie/freddie-system-prompt'
import ToolRuntime from '@freddie/freddie-tools'
import SkillRegistry from '@freddie/freddie-skill'
import * as SkillFileSystem from '@freddie/freddie-skill-filesystem'
import AgentRegistry from '@freddie/freddie-agent'
import GoalService from '@freddie/freddie-goal'
import * as goalSession from '@freddie/freddie-goal-round-driver'
import * as toolGoal from '@freddie/freddie-tool-goal'
import LocalJobRegistry from '@freddie/freddie-jobs-local'
import InvariantRegistry from '@freddie/freddie-invariants'
import * as sessionInvariant from '@freddie/freddie-session/invariant'
import * as agentInvariant from '@freddie/freddie-agent/invariant'
import * as scopeInvariant from '@freddie/freddie-scope/invariant'
import * as agentLoopInvariant from '@freddie/freddie-agent-loop/invariant'
import * as toolBash from '@freddie/freddie-tool-bash'
import * as bashEnv from '@freddie/freddie-shell-env'
import * as workspaceContext from '@freddie/freddie-agent-instructions'
import * as toolSkill from '@freddie/freddie-tool-skill'
import * as toolJobs from '@freddie/freddie-tool-jobs'
import AgentLoop from '@freddie/freddie-agent-loop'
import * as llmRetry from '@freddie/freddie-llm-retry'
import { resolveFreddieHome } from '@freddie/freddie-home-paths'

export const name = 'agent-spine-demo'

const EXAMPLE_SESSION_TITLE_CONFIG = {
  fallbackMaxWords: 5,
  fallbackMaxBytes: 40,
  maxTitleBytes: 80,
}

export const SkillConfigSchema = z.object({
  enabled: z.boolean().default(true),
  registry: SkillRegistry.Config,
  filesystem: SkillFileSystem.Config,
  tool: toolSkill.Config,
})

export const SessionTitleConfigSchema = SessionTitleService.Config
  .default(EXAMPLE_SESSION_TITLE_CONFIG)

export const ToolBashConfigSchema =
  z.union([z.const(false), toolBash.Config])

export const JobsConfigSchema = LocalJobRegistry.Config

export const ToolJobsConfigSchema = toolJobs.Config

export const GoalConfigSchema = z.object({
  domain: GoalService.Config,
  tool: toolGoal.Config,
})

export const Config = z.intersect([
  AgentLoop.Config,
  SystemPrompt.Config,
  z.object({
    tools: ToolRuntime.Config,
    freddieHome: z.string(),
    sessionTitle: SessionTitleConfigSchema,
    skills: SkillConfigSchema,
    workspaceContext: z.union([z.const(false), workspaceContext.Config]).required(),
    toolBash: ToolBashConfigSchema,
    jobs: JobsConfigSchema,
    toolJobs: z.union([z.const(false), ToolJobsConfigSchema]),
    invariants: InvariantRegistry.Config,
    goals: z.union([z.const(false), GoalConfigSchema]),
  }),
])

export function pickSpineConfig(config) {
  return {
    ...config.maxParallelToolCalls !== undefined ? { maxParallelToolCalls: config.maxParallelToolCalls } : {},
    ...config.includeHarnessIdentity !== undefined ? { includeHarnessIdentity: config.includeHarnessIdentity } : {},
    ...config.includeRuntimeContext !== undefined ? { includeRuntimeContext: config.includeRuntimeContext } : {},
    ...config.persona !== undefined ? { persona: config.persona } : {},
    ...config.toolOrder !== undefined ? { toolOrder: config.toolOrder } : {},
    ...config.tools !== undefined ? { tools: config.tools } : {},
    ...config.freddieHome !== undefined ? { freddieHome: config.freddieHome } : {},
    ...config.sessionTitle !== undefined ? { sessionTitle: config.sessionTitle } : {},
    workspaceContext: config.workspaceContext,
    ...config.skills !== undefined ? { skills: config.skills } : {},
    ...config.toolBash !== undefined ? { toolBash: config.toolBash } : {},
    ...config.jobs !== undefined ? { jobs: config.jobs } : {},
    ...config.toolJobs !== undefined ? { toolJobs: config.toolJobs } : {},
    ...config.invariants !== undefined ? { invariants: config.invariants } : {},
    ...config.goals !== undefined ? { goals: config.goals } : {},
  }
}

export function apply(ctx, config) {
  const nestedFreddieHome = config.skills?.filesystem?.freddieHome
  if (config.freddieHome !== undefined && nestedFreddieHome !== undefined
    && resolveFreddieHome(config.freddieHome) !== resolveFreddieHome(nestedFreddieHome)) {
    throw new Error('agent-spine-demo: freddieHome and skills.filesystem.freddieHome must resolve to the same directory')
  }
  const freddieHome = resolveFreddieHome(config.freddieHome ?? nestedFreddieHome)

  ctx.plugin(Timer)
  ctx.plugin(LlmRuntime)
  ctx.plugin(SessionStore)
  ctx.plugin(SessionTitleService, config.sessionTitle ?? EXAMPLE_SESSION_TITLE_CONFIG)
  ctx.plugin(SystemPrompt, {
    includeHarnessIdentity: config.includeHarnessIdentity ?? true,
    includeRuntimeContext: config.includeRuntimeContext ?? true,
    persona: config.persona ?? '',
    ...config.toolOrder !== undefined ? { toolOrder: config.toolOrder } : {},
  })
  ctx.plugin(ToolRuntime, config.tools ?? {})
  const skillsEnabled = config.skills?.enabled ?? true
  if (skillsEnabled) {
    ctx.plugin(SkillRegistry, config.skills?.registry ?? {})
    ctx.plugin(SkillFileSystem, Object.assign({}, config.skills?.filesystem, { freddieHome }))
  }
  ctx.plugin(AgentRegistry)
  ctx.plugin(llmRetry)
  if (config.goals !== undefined && config.goals !== false) {
    ctx.plugin(GoalService, config.goals.domain ?? {})
    ctx.plugin(toolGoal, config.goals.tool ?? {})
    ctx.plugin(goalSession)
  }
  ctx.plugin(LocalJobRegistry, config.jobs ?? {})
  ctx.plugin(InvariantRegistry, config.invariants ?? {})
  ctx.plugin(sessionInvariant)
  ctx.plugin(agentInvariant)
  ctx.plugin(scopeInvariant)
  ctx.plugin(agentLoopInvariant)
  if (config.toolBash !== false) {
    ctx.plugin(bashEnv, { freddieHome })
    ctx.plugin(toolBash, config.toolBash ?? {})
  }
  if (config.workspaceContext !== false) {
    ctx.plugin(workspaceContext, config.workspaceContext)
  }
  if (skillsEnabled) ctx.plugin(toolSkill, config.skills?.tool ?? {})
  if (config.toolJobs !== false) ctx.plugin(toolJobs, config.toolJobs ?? {})
  ctx.plugin(AgentLoop, {
    agents: config.agents ?? [],
    ...config.maxParallelToolCalls !== undefined ? { maxParallelToolCalls: config.maxParallelToolCalls } : {},
  })
}
