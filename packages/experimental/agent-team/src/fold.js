/** Strict replay fold for Agent Teams log-only events. */

import { SessionId } from '@freddie/freddie-session'
import {
  TeamId as toTeamId,
  TeamMessageId as toTeamMessageId,
  TeamTaskId as toTeamTaskId,
} from './types.js'
import { assertTaskGraphCandidate } from './task-graph.js'

const numericTaskIdPattern = /^task-(\d+)$/u

/** Mutable internal replay state. */

/**
 * Construct an empty Team fold for one root Session.
 * @param rootId - Session whose TeamId selects applicable records.
 * @returns mutable empty replay state.
 */
export function emptyTeamFoldState(rootId) {
  return {
    id: toTeamId(rootId),
    members: new Map(),
    memberIdsByName: new Map(),
    tasks: new Map(),
    messages: new Map(),
    delivered: new Set(),
    nextTaskNumber: 1,
  }
}

/** Whether one event belongs to the Team domain. */

/** One event owned by the Team domain. */

/**
 * Test whether a Session event belongs to the Team domain.
 * @param event - candidate Session event.
 * @returns whether the event has a Team-owned type.
 */
export function isTeamEvent(event) {
  return event.type === 'team/member'
    || event.type === 'team/task'
    || event.type === 'team/message/queued'
    || event.type === 'team/message/delivered'
}

/** Reshape one persisted member snapshot, converting id fields to their typed form. */
function reshapeMember(member) {
  return { ...member, id: SessionId(member.id) }
}

/** Reshape one persisted task snapshot, converting id fields to their typed form. */
function reshapeTask(task) {
  return {
    ...task,
    id: toTeamTaskId(task.id),
    ownerId: task.ownerId === undefined ? undefined : SessionId(task.ownerId),
    blockedBy: task.blockedBy.map(id => toTeamTaskId(id)),
  }
}

/** Reshape one persisted message snapshot, converting id fields to their typed form. */
function reshapeMessage(message) {
  return {
    ...message,
    id: toTeamMessageId(message.id),
    senderId: SessionId(message.senderId),
    targetId: SessionId(message.targetId),
  }
}

/** Decode the complete current-version payload selected by one Team event type. */
function parseCurrentTeamEvent(event) {
  switch (event.type) {
    case 'team/member':
      return { ...event, data: { ...event.data, teamId: toTeamId(event.data.teamId), member: reshapeMember(event.data.member) } }
    case 'team/task':
      return { ...event, data: { ...event.data, teamId: toTeamId(event.data.teamId), task: reshapeTask(event.data.task) } }
    case 'team/message/queued':
      return { ...event, data: { ...event.data, teamId: toTeamId(event.data.teamId), message: reshapeMessage(event.data.message) } }
    case 'team/message/delivered':
      return {
        ...event,
        data: {
          ...event.data,
          teamId: toTeamId(event.data.teamId),
          messageId: toTeamMessageId(event.data.messageId),
          targetId: SessionId(event.data.targetId),
        },
      }
    /* v8 ignore next 2 -- TeamEventType is closed and every member is handled above. */
    default:
      return event
  }
}

/**
 * Apply one event, ignoring Team records inherited by a different root fork.
 * @param state - mutable Team replay state.
 * @param event - next contiguous Session event.
 */
export function applyTeamEvent(state, event) {
  if (!isTeamEvent(event)) return
  const selector = event.data
  if (selector.version !== 1) {
    if (toTeamId(selector.teamId) !== state.id) return
    throw new Error(`unsupported Agent Teams event version ${String(selector.version)}`)
  }
  const decoded = parseCurrentTeamEvent(event)
  if (decoded.data.teamId !== state.id) return

  switch (decoded.type) {
    case 'team/member': {
      const member = decoded.data.member
      const prior = state.members.get(member.id)
      const named = state.memberIdsByName.get(member.name)
      if (named !== undefined && named !== member.id) {
        throw new Error(`teammate name "${member.name}" is reused by another member`)
      }
      if (prior === undefined) {
        if (member.phase !== 'provisioning') throw new Error(`teammate "${member.name}" must begin provisioning`)
        state.memberIdsByName.set(member.name, member.id)
      } else {
        if (prior.name !== member.name || prior.provider !== member.provider || prior.context !== member.context) {
          throw new Error(`teammate "${member.id}" changed immutable identity fields`)
        }
        if (prior.phase !== 'provisioning' || member.phase === 'provisioning') {
          throw new Error(`teammate "${member.name}" has an invalid ${prior.phase} -> ${member.phase} transition`)
        }
      }
      state.members.set(member.id, member)
      break
    }
    case 'team/task': {
      const task = decoded.data.task
      const prior = state.tasks.get(task.id)
      if (prior === undefined && task.revision !== 1) {
        throw new Error(`team task "${task.id}" must begin at revision 1`)
      }
      if (prior !== undefined && task.revision !== prior.revision + 1) {
        throw new Error(`team task "${task.id}" revision is not contiguous`)
      }
      assertTaskGraphCandidate(state.tasks, task)
      const match = numericTaskIdPattern.exec(task.id)
      if (match !== null) {
        const number = Number(match[1])
        state.nextTaskNumber = Math.max(
          state.nextTaskNumber,
          number === Number.MAX_SAFE_INTEGER ? number : number + 1,
        )
      }
      state.tasks.set(task.id, task)
      break
    }
    case 'team/message/queued': {
      const message = decoded.data.message
      if (state.messages.has(message.id)) throw new Error(`team message "${message.id}" was queued twice`)
      state.messages.set(message.id, message)
      break
    }
    case 'team/message/delivered': {
      const queued = state.messages.get(decoded.data.messageId)
      if (queued === undefined) throw new Error(`team message "${decoded.data.messageId}" was delivered before queueing`)
      if (queued.targetId !== decoded.data.targetId) throw new Error(`team message "${decoded.data.messageId}" target changed`)
      if (state.delivered.has(decoded.data.messageId)) throw new Error(`team message "${decoded.data.messageId}" was delivered twice`)
      state.delivered.add(decoded.data.messageId)
      break
    }
    /* v8 ignore next 2 -- TeamEventType is closed and every member is handled above. */
    default:
      return
  }
}

/**
 * Replay one root Session into its current Team state.
 * @param rootId - root Session identity selecting Team-owned records.
 * @param events - complete contiguous Session log.
 * @returns mutable replay state at the end of the log.
 */
export function foldTeam(rootId, events) {
  const state = emptyTeamFoldState(rootId)
  for (const event of events) applyTeamEvent(state, event)
  return state
}
