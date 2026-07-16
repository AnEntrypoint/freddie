// Reusable approval-workflow xstate machine: idle -> pending -> approved|rejected.
// Wired through createPersistentActor for resumability, matching every other
// long-lived machine in src/machines/ per AGENTS.md's snapshot-store pattern.
import { createMachine, assign } from 'xstate'
import { createPersistentActor } from '../persistent-actor.js'

export function createApprovalMachine({ onApprove, onReject } = {}) {
    return createMachine({
        id: 'approval-workflow',
        initial: 'idle',
        context: { requestedBy: null, reason: null, decidedBy: null, decidedReason: null },
        states: {
            idle: {
                on: {
                    REQUEST: {
                        target: 'pending',
                        actions: assign({ requestedBy: ({ event }) => event.requestedBy || null, reason: ({ event }) => event.reason || null }),
                    },
                },
            },
            pending: {
                on: {
                    APPROVE: {
                        target: 'approved',
                        actions: [
                            assign({ decidedBy: ({ event }) => event.decidedBy || null, decidedReason: ({ event }) => event.reason || null }),
                            ({ context, event }) => onApprove?.({ ...context, decidedBy: event.decidedBy, decidedReason: event.reason }),
                        ],
                    },
                    REJECT: {
                        target: 'rejected',
                        actions: [
                            assign({ decidedBy: ({ event }) => event.decidedBy || null, decidedReason: ({ event }) => event.reason || null }),
                            ({ context, event }) => onReject?.({ ...context, decidedBy: event.decidedBy, decidedReason: event.reason }),
                        ],
                    },
                },
            },
            approved: { type: 'final' },
            rejected: { type: 'final' },
        },
    })
}

export async function startApprovalWorkflow({ key, requestedBy, reason, onApprove, onReject }) {
    const machine = createApprovalMachine({ onApprove, onReject })
    const { actor, resumed, flush } = await createPersistentActor(machine, { kind: 'approval-workflow', key })
    if (!resumed) actor.send({ type: 'REQUEST', requestedBy, reason })
    return { actor, resumed, flush }
}
