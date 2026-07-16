// Throwaway verification: default (no store param) path still writes to the
// real libsql DB exactly as before. DELETE THIS FILE after running.
process.env.FREDDIE_TEST_DB = 'memory' // isolate from any real ~/.freddie state, still exercises the real libsql DbAdapter code path
import { createMachine, assign } from 'xstate'
import { createPersistentActor } from './src/machines/persistent-actor.js'
import { runStep, isStepDone, clearSteps } from './src/machines/step-journal.js'
import { load } from './src/machines/snapshot-store.js'

const machine = createMachine({
    id: 'verify-default',
    initial: 'a',
    context: { n: 0 },
    states: {
        a: { on: { GO: { target: 'b', actions: assign({ n: ({ context }) => context.n + 1 }) } } },
        b: { type: 'final' },
    },
})

const key = 'verify-default-key-' + Date.now()

// 1. createPersistentActor with NO store param -> must use libsql default.
const pa = await createPersistentActor(machine, { kind: 'verify', key, input: {} })
console.log('resumed (expect false, fresh):', pa.resumed)

pa.actor.send({ type: 'GO' })
await pa.flush()

const snapAfterFinal = await load('verify', key)
console.log('snapshot after final (expect null, cleared on final):', snapAfterFinal)

// 2. runStep with NO store param -> must use libsql step_results table.
let calls = 0
const sessionKey = 'verify-step-session-' + Date.now()
const r1 = await runStep(sessionKey, 'step1', async () => { calls++; return { val: 42 } })
const r2 = await runStep(sessionKey, 'step1', async () => { calls++; return { val: 999 } }) // must NOT run fn again
console.log('r1:', r1, 'r2 (expect same as r1):', r2, 'calls (expect 1):', calls)

const done = await isStepDone(sessionKey, 'step1')
console.log('isStepDone (expect true):', done)

await clearSteps(sessionKey)
const doneAfterClear = await isStepDone(sessionKey, 'step1')
console.log('isStepDone after clear (expect false):', doneAfterClear)

console.log('DEFAULT PATH VERIFICATION: ' + (
    pa.resumed === false &&
    snapAfterFinal === null &&
    calls === 1 &&
    JSON.stringify(r1) === JSON.stringify(r2) &&
    done === true &&
    doneAfterClear === false
    ? 'PASS' : 'FAIL'))
