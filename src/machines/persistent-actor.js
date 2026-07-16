// Persistent xstate actor wrapper.
//
// createPersistentActor rehydrates an actor from its last persisted snapshot
// (if any), auto-persists on every transition, and clears its snapshot the
// moment it reaches a final/stopped state. This is the single primitive every
// long-lived freddie subsystem uses to become resumable across a process refresh.
import { createActor } from 'xstate'
import { persist, load, clear } from './snapshot-store.js'
import { logger } from '../observability/log.js'
import { redactSecret } from '../utils.js'

const log = logger('persistent-actor')

// redactSecret() is string-oriented (regex over provider keys/Bearer tokens/
// AWS keys); apply it over the whole context via a stringify round-trip so
// nested fields are covered without hand-walking the shape of every machine's
// context. A context that fails to stringify (circular, etc) logs as null
// rather than throwing out of the transition subscriber.
function redactSensitive(context) {
    try { return JSON.parse(redactSecret(JSON.stringify(context))) }
    catch { return null }
}

// machine: an xstate machine. kind+key: snapshot identity. input: actor input
// (used only on a fresh start — a rehydrated actor restores its own context).
// onTransition: optional callback per snapshot. store: optional alternate
// snapshot store (see snapshot-store.js's createLibsqlSnapshotStore contract
// comment for the persist/load/clear guarantees an alternate implementation
// must provide) — when omitted, defaults to the libsql-backed persist/load/
// clear functions imported above, so every existing caller is unaffected.
export async function createPersistentActor(machine, { kind, key, input, onTransition, store } = {}) {
    if (!kind || !key) throw new Error('createPersistentActor requires kind and key')
    const persistFn = store?.persist || persist
    const loadFn = store?.load || load
    const clearFn = store?.clear || clear
    const machineId = machine?.id || machine?.config?.id || null
    const snapshot = await loadFn(kind, key, { machineId })
    const resumed = !!snapshot

    // xstate v5's snapshot object carries no reference to the event that
    // triggered a given transition -- `inspect` is the real API surface for
    // that (fires an '@xstate.event' entry, in order, immediately before the
    // matching subscribe() callback for the same transition).
    let lastEventType = null
    const inspect = (ev) => { if (ev.type === '@xstate.event' && ev.event?.type) lastEventType = ev.event.type }

    const actor = snapshot
        ? createActor(machine, { snapshot, inspect })
        : createActor(machine, { input, inspect })

    let lastValue = null
    let persisting = Promise.resolve()
    const sub = actor.subscribe((snap) => {
        const from = lastValue
        const to = snap.value
        // Redact anything that looks like a secret/credential/token before it
        // ever reaches the structured log -- context can carry provider keys,
        // auth tokens, etc depending on the machine.
        const context = redactSensitive(snap.context)
        if (JSON.stringify(from) !== JSON.stringify(to)) {
            log.info('transition', { kind, key, from, to, trigger: lastEventType, context })
        }
        lastValue = to
        // Serialize persists so rapid consecutive transitions land last-write-wins
        // without interleaving; the store upsert is keyed by (kind,key).
        persisting = persisting.then(async () => {
            try {
                const ps = actor.getPersistedSnapshot()
                if (snap.status === 'active') {
                    await persistFn(kind, key, ps, { machineId })
                } else {
                    // Final/stopped: clear so a completed actor never resurrects on boot.
                    await clearFn(kind, key)
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
        async forget() { await persisting; try { sub.unsubscribe() } catch {}; await clearFn(kind, key) },
    }
}
