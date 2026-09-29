import { Service } from '@freddie/cordis'
import z from '@freddie/schemastery'
import { TeamActivity } from './activity.js'
import { errorMessage, TeamError } from './error.js'
import { TeamJournal } from './journal.js'
import { TeamRuntimeLifecycle } from './lifecycle.js'
import { TeamMailbox } from './mailbox.js'
import { TeamRoster } from './roster.js'
import { TeamTaskBoard } from './task-board.js'
import { TeamId, TeamTaskId } from './types.js'

export { TeamId, TeamMessageId, TeamTaskId } from './types.js'
export { TeamError } from './error.js'
export { foldTeam } from './fold.js'

const DEFAULT_MAX_MEMBERS = 8
const DEFAULT_MAX_TASKS = 256
const DEFAULT_MAX_PENDING_MESSAGES = 64
const DEFAULT_MAX_MESSAGE_BYTES = 65_536
const DEFAULT_DISPOSAL_TIMEOUT_MS = 5_000

function positiveLimit(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TeamError(`${name} must be a positive safe integer`, 'TEAM_INVALID_CONFIG')
  }
  return value
}

export class TeamService extends Service {
  static inject = ['agents', 'sessions', 'sessionPersistence', 'subagents']

  static Config = z.object({
    maxMembers: z.number().step(1).min(1).default(DEFAULT_MAX_MEMBERS),
    maxTasks: z.number().step(1).min(1).default(DEFAULT_MAX_TASKS),
    maxPendingMessagesPerMember: z.number().step(1).min(1).default(DEFAULT_MAX_PENDING_MESSAGES),
    maxMessageBytes: z.number().step(1).min(1).default(DEFAULT_MAX_MESSAGE_BYTES),
    disposalTimeoutMs: z.number().step(1).min(1).default(DEFAULT_DISPOSAL_TIMEOUT_MS),
  })

  constructor(ctx, config = {}) {
    super(ctx, 'agentTeams')
    this.config = {
      maxMembers: positiveLimit('maxMembers', config.maxMembers ?? DEFAULT_MAX_MEMBERS),
      maxTasks: positiveLimit('maxTasks', config.maxTasks ?? DEFAULT_MAX_TASKS),
      maxPendingMessagesPerMember: positiveLimit(
        'maxPendingMessagesPerMember',
        config.maxPendingMessagesPerMember ?? DEFAULT_MAX_PENDING_MESSAGES,
      ),
      maxMessageBytes: positiveLimit('maxMessageBytes', config.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES),
      disposalTimeoutMs: positiveLimit(
        'disposalTimeoutMs',
        config.disposalTimeoutMs ?? DEFAULT_DISPOSAL_TIMEOUT_MS,
      ),
    }

    this.activity = new TeamActivity()
    this.lifecycle = new TeamRuntimeLifecycle(this.config.disposalTimeoutMs)
    this.journal = new TeamJournal(ctx, (root) => { this.activity.notify(TeamId(root.id)) })
    this.roster = new TeamRoster(ctx, this.journal, this.lifecycle, this.config.maxMembers)
    this.mailbox = new TeamMailbox(
      ctx,
      this.journal,
      this.roster,
      this.lifecycle,
      this.config.maxPendingMessagesPerMember,
      this.config.maxMessageBytes,
    )
    this.tasks = new TeamTaskBoard(this.journal, this.config.maxTasks)

    ctx.on('session/event', (session, event) => { this.mailbox.observeSessionEvent(session, event) })
    ctx.on('agent/session-start', ({ agent }) => { this.scheduleRecovery(agent) })
    ctx.on('agent/status', ({ agent }) => {
      const membership = this.roster.tryMembership(agent)
      if (membership !== undefined) this.activity.notify(membership.id)
    })
    ctx.effect(() => () => this.disposeRuntime(), 'agentTeams.runtimeLifecycle()')
    for (const agent of ctx.agents.list()) this.scheduleRecovery(agent)
  }

  membership(agent) {
    return this.roster.membership(agent)
  }

  listMembers(agent) {
    return this.roster.list(this.roster.membership(agent))
  }

  async spawnTeammate(caller, request) {
    return await this.roster.spawn(caller, request)
  }

  async sendMessage(caller, request) {
    return await this.mailbox.send(caller, request)
  }

  async createTask(caller, request) {
    return await this.tasks.create(this.roster.membership(caller), request)
  }

  getTask(caller, id) {
    return this.tasks.get(this.roster.membership(caller), id)
  }

  listTasks(caller) {
    return this.tasks.list(this.roster.membership(caller))
  }

  async updateTask(caller, request) {
    return await this.tasks.update(caller, this.roster.membership(caller), request)
  }

  async waitForChange(caller, timeoutMs, signal) {
    const membership = this.roster.membership(caller)
    return await this.activity.wait(membership.id, timeoutMs, signal)
  }

  interrupt(caller, targetName) {
    return this.roster.interrupt(caller, targetName)
  }

  tryMembership(agent) {
    return this.roster.tryMembership(agent)
  }

  scheduleRecovery(agent) {
    queueMicrotask(() => {
      if (this.lifecycle.disposed) return
      void this.recoverFor(agent).catch((error) => {
        if (this.lifecycle.disposed) return
        this.ctx.logger.warn(`Agent Teams recovery for "${agent.id}" failed: ${errorMessage(error)}`)
      })
    })
  }

  async recoverFor(agent) {
    await this.roster.recoverFor(agent, this.lifecycle.signal)
    await this.mailbox.recoverFor(agent, this.lifecycle.signal)
  }

  async disposeRuntime() {
    this.lifecycle.close()
    this.activity.close()

    const failures = []
    await this.lifecycle.settle(this.roster.pendingCreations(), failures)
    await this.lifecycle.settle(this.mailbox.pendingDispatches(), failures)
    for (const [root, childIds] of this.roster.liveChildrenByRoot()) {
      try {
        await this.roster.stopTeammates(root, childIds)
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, 'Agent Teams runtime disposal failed')
  }
}

export default TeamService
