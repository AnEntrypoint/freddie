// Persistent xstate actor wrapper.
//
// createPersistentActor rehydrates an actor from its last persisted snapshot
// (if any), auto-persists on every transition, and clears its snapshot the
// moment it reaches a final/stopped state. This is the single primitive every
// long-lived freddie subsystem uses to become resumable across a process refresh.
import { createActor } from 'xstate'
import { persist, load, clear } from './snapshot-store.js'
import { logger } from '../observability/log.js'

const log = logger('persistent-actor')

// machine: an xstate machine. kind+key: snapshot identity. input: actor input
// (used only on a fresh start — a rehydrated actor restores its own context).
// onTransition: optional callback per snapshot.
export async function createPersistentActor(machine, { kind, key, input, onTransition } = {}) {
    if (!kind || !key) throw new Error('createPersistentActor requires kind and key')
    const machineId = machine?.id || machine?.config?.id || null
    const snapshot = await load(kind, key, { machineId })
    const resumed = !!snapshot
    const actor = snapshot
        ? createActor(machine, { snapshot })
        : createActor(machine, { input })

    let persisting = Promise.resolve()
    const sub = actor.subscribe((snap) => {
        // Serialize persists so rapid consecutive transitions land last-write-wins
        // without interleaving; the store upsert is keyed by (kind,key).
        persisting = persisting.then(async () => {
            try {
                const ps = actor.getPersistedSnapshot()
                if (snap.status === 'active') {
                    await persist(kind, key, ps, { machineId })
                } else {
                    // Final/stopped: clear so a completed actor never resurrects on boot.
                    await clear(kind, key)
                }
                onTransition?.(snap)
            } catch (e) {
                log.error('persist failed', { kind, key, err: String(e) })
            }
        })
    })

    if (resumed) log.info('actor resumed from snapshot', { kind, key, machineId })

    actor.start()
    return {
        actor,
        resumed,
        // Await all in-flight persists then unsubscribe — call before stopping so
        // the final snapshot state is durable.
        async flush() { await persisting; try { sub.unsubscribe() } catch {} },
        // Clear this actor's snapshot explicitly (e.g. on external cancel).
        async forget() { await persisting; try { sub.unsubscribe() } catch {}; await clear(kind, key) },
    }
}
