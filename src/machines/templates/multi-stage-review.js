// Reusable N-stage review workflow: draft -> review1 -> review2 -> ... -> approved.
// Stage count is configurable at machine-creation time (createMachine's config
// is built dynamically since xstate has no native "repeat this state N times"
// primitive). Wired through createPersistentActor for resumability.
import { createMachine, assign } from 'xstate'
import { createPersistentActor } from '../persistent-actor.js'

export function createMultiStageReviewMachine({ stageCount = 2, onApproveStage, onRejectAll } = {}) {
    if (!Number.isInteger(stageCount) || stageCount < 1) throw new Error('stageCount must be a positive integer')
    const stageNames = Array.from({ length: stageCount }, (_, i) => `review${i + 1}`)
    const states = {
        draft: {
            on: { SUBMIT: { target: stageNames[0], actions: assign({ submittedBy: ({ event }) => event.submittedBy || null }) } },
        },
    }
    stageNames.forEach((name, i) => {
        const nextTarget = i + 1 < stageNames.length ? stageNames[i + 1] : 'approved'
        states[name] = {
            on: {
                APPROVE_STAGE: {
                    target: nextTarget,
                    actions: [
                        assign({ approvals: ({ context, event }) => [...(context.approvals || []), { stage: name, by: event.by || null, ts: Date.now() }] }),
                        ({ context, event }) => onApproveStage?.({ stage: name, by: event.by, context }),
                    ],
                },
                REJECT: {
                    target: 'rejected',
                    actions: [
                        assign({ rejectedAt: () => name, rejectedReason: ({ event }) => event.reason || null }),
                        ({ context, event }) => onRejectAll?.({ stage: name, reason: event.reason, context }),
                    ],
                },
            },
        }
    })
    states.approved = { type: 'final' }
    states.rejected = { type: 'final' }
    return createMachine({ id: 'multi-stage-review', initial: 'draft', context: { submittedBy: null, approvals: [], rejectedAt: null, rejectedReason: null }, states })
}

export async function startMultiStageReview({ key, stageCount, submittedBy, onApproveStage, onRejectAll }) {
    const machine = createMultiStageReviewMachine({ stageCount, onApproveStage, onRejectAll })
    const { actor, resumed, flush } = await createPersistentActor(machine, { kind: 'multi-stage-review', key })
    if (!resumed) actor.send({ type: 'SUBMIT', submittedBy })
    return { actor, resumed, flush }
}
