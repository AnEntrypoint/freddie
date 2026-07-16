// Reusable incident-response workflow:
// detected -> triaging -> mitigating -> resolved -> postmortem.
// Wired through createPersistentActor for resumability.
import { createMachine, assign } from 'xstate'
import { createPersistentActor } from '../persistent-actor.js'

export function createIncidentResponseMachine({ onResolved } = {}) {
    return createMachine({
        id: 'incident-response',
        initial: 'detected',
        context: { severity: null, owner: null, timeline: [], mitigationNotes: null, postmortemUrl: null },
        states: {
            detected: {
                on: {
                    TRIAGE: {
                        target: 'triaging',
                        actions: assign({ severity: ({ event }) => event.severity || null, timeline: ({ context }) => [...context.timeline, { at: 'triaging', ts: Date.now() }] }),
                    },
                },
            },
            triaging: {
                on: {
                    MITIGATE: {
                        target: 'mitigating',
                        actions: assign({ owner: ({ event }) => event.owner || null, timeline: ({ context }) => [...context.timeline, { at: 'mitigating', ts: Date.now() }] }),
                    },
                },
            },
            mitigating: {
                on: {
                    RESOLVE: {
                        target: 'resolved',
                        actions: [
                            assign({ mitigationNotes: ({ event }) => event.notes || null, timeline: ({ context }) => [...context.timeline, { at: 'resolved', ts: Date.now() }] }),
                            ({ context, event }) => onResolved?.({ ...context, notes: event.notes }),
                        ],
                    },
                },
            },
            resolved: {
                on: {
                    POSTMORTEM: {
                        target: 'postmortem',
                        actions: assign({ postmortemUrl: ({ event }) => event.url || null, timeline: ({ context }) => [...context.timeline, { at: 'postmortem', ts: Date.now() }] }),
                    },
                },
            },
            postmortem: { type: 'final' },
        },
    })
}

export async function startIncidentResponse({ key, onResolved }) {
    const machine = createIncidentResponseMachine({ onResolved })
    const { actor, resumed, flush } = await createPersistentActor(machine, { kind: 'incident-response', key })
    return { actor, resumed, flush }
}
