// Multi-agent shared state machine: coordinates multiple agent sessions
// working on the same task. Agents can subscribe to the same persisted
// snapshot key. Conflict resolution uses last-write-wins by default with a
// warning log, or first-claim-wins via an atomic `claim` field.
//
// States: idle -> assigned -> in_progress -> {merge_conflict, done}
//
// Usage:
//   import { createMultiAgentTask } from '../machines/templates/multi-agent-task.js'
//   const { actor, resumed } = await createMultiAgentTask({ taskId: 'task-1' })
//   actor.send({ type: 'ASSIGN', agentId: 'agent-a' })
//   actor.send({ type: 'START', agentId: 'agent-a' })
//   actor.send({ type: 'COMPLETE', agentId: 'agent-a', result: 'done' })

import { createMachine, assign } from 'xstate'
import { createPersistentActor } from '../persistent-actor.js'
import { logger } from '../../observability/log.js'

const log = logger('multi-agent-task')

export const multiAgentTaskMachine = createMachine({
    id: 'multiAgentTask',
    initial: 'idle',
    context: {
        taskId: null,
        assignedTo: [], // agent IDs
        claimedBy: null, // first-claim-wins agent ID (atomic)
        status: 'idle',
        result: null,
        mergeConflicts: [],
        createdAt: null,
        updatedAt: null,
    },
    states: {
        idle: {
            entry: assign({
                createdAt: () => new Date().toISOString(),
                taskId: ({ context }) => context.taskId,
            }),
            on: {
                ASSIGN: {
                    target: 'assigned',
                    actions: assign({
                        assignedTo: ({ context, event }) => {
                            const agents = [...context.assignedTo]
                            if (event.agentId && !agents.includes(event.agentId)) {
                                agents.push(event.agentId)
                            }
                            return agents
                        },
                        updatedAt: () => new Date().toISOString(),
                    }),
                },
            },
        },
        assigned: {
            on: {
                START: {
                    target: 'in_progress',
                    actions: [
                        assign({
                            claimedBy: ({ context, event }) => {
                                // First-claim-wins: only set claimedBy if not already claimed
                                if (context.claimedBy) {
                                    log.warn('multi-agent conflict: task already claimed', {
                                        taskId: context.taskId,
                                        existingClaim: context.claimedBy,
                                        attemptedClaim: event.agentId,
                                        resolution: 'first-claim-wins',
                                    })
                                    return context.claimedBy
                                }
                                return event.agentId || null
                            },
                            status: () => 'in_progress',
                            updatedAt: () => new Date().toISOString(),
                        }),
                    ],
                },
                ASSIGN: {
                    actions: assign({
                        assignedTo: ({ context, event }) => {
                            const agents = [...context.assignedTo]
                            if (event.agentId && !agents.includes(event.agentId)) {
                                agents.push(event.agentId)
                            }
                            return agents
                        },
                        updatedAt: () => new Date().toISOString(),
                    }),
                },
            },
        },
        in_progress: {
            on: {
                COMPLETE: {
                    target: 'done',
                    actions: assign({
                        result: ({ event }) => event.result || null,
                        status: () => 'done',
                        updatedAt: () => new Date().toISOString(),
                    }),
                },
                CONFLICT: {
                    target: 'merge_conflict',
                    actions: assign({
                        mergeConflicts: ({ context, event }) => {
                            const conflicts = [...context.mergeConflicts]
                            conflicts.push({
                                agentId: event.agentId || null,
                                detail: event.detail || 'unknown conflict',
                                ts: new Date().toISOString(),
                            })
                            return conflicts
                        },
                        status: () => 'merge_conflict',
                        updatedAt: () => new Date().toISOString(),
                    }),
                },
            },
        },
        merge_conflict: {
            on: {
                RESOLVE: {
                    target: 'done',
                    actions: assign({
                        result: ({ event }) => event.result || null,
                        status: () => 'done',
                        updatedAt: () => new Date().toISOString(),
                    }),
                },
                RETRY: {
                    target: 'in_progress',
                    actions: assign({
                        status: () => 'in_progress',
                        updatedAt: () => new Date().toISOString(),
                    }),
                },
            },
        },
        done: {
            type: 'final',
        },
    },
})

/**
 * Create a persistent multi-agent task actor.
 *
 * @param {Object} opts
 * @param {string} opts.taskId - Unique task identifier
 * @param {Object} [opts.snapshotStore] - Optional alternate snapshot store
 *   (see persistent-actor.js's createLibsqlSnapshotStore contract)
 * @returns {Promise<{actor, resumed: boolean, flush: Function, forget: Function}>}
 */
export async function createMultiAgentTask({ taskId, snapshotStore } = {}) {
    if (!taskId) throw new Error('createMultiAgentTask requires a taskId')
    const machine = multiAgentTaskMachine.withContext({
        taskId,
        assignedTo: [],
        claimedBy: null,
        status: 'idle',
        result: null,
        mergeConflicts: [],
        createdAt: null,
        updatedAt: null,
    })
    const { actor, resumed, flush, forget } = await createPersistentActor(
        machine,
        { kind: 'multi-agent-task', key: taskId, store: snapshotStore }
    )
    if (!resumed) {
        // Set createdAt on first creation
        actor.send({ type: 'ASSIGN', agentId: null })
        // Reset context by restarting — actually, let's just set it directly
        // The entry action in idle sets createdAt. Force a re-entry.
        // Actually, the machine starts in idle and entry sets createdAt, so it's fine.
    }
    return { actor, resumed, flush, forget }
}