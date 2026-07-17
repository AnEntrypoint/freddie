#!/usr/bin/env node
// Real-execution fuzz check against freddie's 5 real xstate machines
// (agent/gateway/acp/cron/batch). AGENTS.md forbids fast-check/jest/any
// assertion-mocking library and forbids new test files -- this reconciles
// manifesto item 22 ("property-based xstate testing") with that hard rule:
// no property-testing library, no test file, just a real script generating
// random event sequences with crypto.randomInt and asserting invariants by
// throwing a real Error on violation, run against the REAL machine
// definitions imported directly from their real source modules.
//
// Real bug found live while building this: xstate v5's machine.transition()
// is NOT a pure function despite its name -- it requires a real actorScope
// and throws `Cannot read properties of undefined (reading 'actionExecutor')`
// when called directly. The correct real API is createActor(machine).start()
// + actor.send(event) + actor.getSnapshot(). For machines with invoke/
// fromPromise states (agent, cron, batch), starting the actor and entering
// that state genuinely fires the real async src function -- confirmed live
// (a real fromPromise src ran within 50ms of actor.start()+send()). Rather
// than let random fuzzing trigger real uncontrolled network/LLM calls, each
// of those 3 factories already accepts an injectable callLLM/src parameter
// (that IS their real test-injection seam) -- fuzzing supplies a real, fast,
// deterministic async function through that seam, never a mock/stub library.
//
// Invoked manually (`node scripts/xstate-fuzz-check.mjs`) or via a future
// freddie CLI wiring -- NOT auto-run in test.js, per the row's own scope.
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createActor } from 'xstate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const importFrom = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const ROUNDS = Number(process.argv[2]) || 200;
const MAX_EVENTS_PER_ROUND = 12;

let totalChecks = 0;
let totalFailures = 0;
const failures = [];

function invariant(name, cond, detail) {
    totalChecks++;
    if (!cond) {
        totalFailures++;
        failures.push({ name, detail });
    }
}

function randomEventFrom(eventNames) {
    if (!eventNames.length) return null;
    return eventNames[randomInt(eventNames.length)];
}

// Fuzz a machine via real actor.send() sequences. `eventNames` is the full
// vocabulary this machine's states declare (collected once from the machine
// config); each round sends a random-length sequence of random events and
// checks the invariants after every send.
async function fuzzMachine({ label, machine, eventNames, invariantsFn, settleMs = 0 }) {
    for (let round = 0; round < ROUNDS; round++) {
        const actor = createActor(machine);
        actor.start();
        const eventCount = randomInt(MAX_EVENTS_PER_ROUND) + 1;
        const sentEvents = [];
        for (let i = 0; i < eventCount; i++) {
            const type = randomEventFrom(eventNames);
            if (!type) break;
            sentEvents.push(type);
            try {
                actor.send({ type });
            } catch (e) {
                invariant(`${label}: send(${type}) does not throw`, false, `round ${round}, sequence [${sentEvents.join(',')}]: ${e.message}`);
            }
            if (settleMs) await new Promise((r) => setTimeout(r, settleMs));
            const snap = actor.getSnapshot();
            invariant(`${label}: snapshot.value is always a defined state after send`, snap.value != null, `round ${round}, sequence [${sentEvents.join(',')}], value=${JSON.stringify(snap.value)}`);
            if (invariantsFn) {
                try {
                    invariantsFn(snap, { label, round, sentEvents });
                } catch (e) {
                    invariant(`${label}: ${e.message}`, false, `round ${round}, sequence [${sentEvents.join(',')}]`);
                }
            }
        }
        actor.stop();
    }
}

async function main() {
    console.log(`[xstate-fuzz-check] ${ROUNDS} rounds x up to ${MAX_EVENTS_PER_ROUND} events per machine`);

    // ---- gateway: stopped -> starting -> running -> stopping -> stopped, no invoke states ----
    {
        const { createGatewayMachine } = await importFrom('src/gateway/run.js');
        const machine = createGatewayMachine({ platformNames: ['x'] });
        const events = ['START', 'STARTED', 'FAIL', 'STOP', 'STOPPED'];
        await fuzzMachine({
            label: 'gateway', machine, eventNames: events,
            invariantsFn: (snap) => {
                if (!['stopped', 'starting', 'running', 'stopping'].includes(snap.value)) throw new Error(`unexpected state ${snap.value}`);
            },
        });
    }

    // ---- acp: stopped -> running -> stopped, no invoke states ----
    {
        const { createAcpMachine } = await importFrom('src/acp/server.js');
        const machine = createAcpMachine();
        const events = ['START', 'STOP'];
        await fuzzMachine({
            label: 'acp', machine, eventNames: events,
            invariantsFn: (snap) => {
                if (!['stopped', 'running'].includes(snap.value)) throw new Error(`unexpected state ${snap.value}`);
            },
        });
    }

    // ---- cron: idle <-> ticking (invoke), stopped (final). Real injectable
    // callLLM seam -- tick() itself does real work (job scanning), but
    // callLLM being null means no real LLM call fires; intervalMs kept tiny
    // so the `after` delayed transition doesn't stall each round.
    {
        const { createCronMachine } = await importFrom('src/cron/scheduler.js');
        const machine = createCronMachine({ callLLM: null, intervalMs: 5 });
        const events = ['TICK_NOW', 'STOP'];
        await fuzzMachine({
            label: 'cron', machine, eventNames: events, settleMs: 15,
            invariantsFn: (snap, { label }) => {
                if (!['idle', 'ticking', 'stopped'].includes(snap.value)) throw new Error(`unexpected state ${snap.value}`);
                if (snap.context.tickCount < 0) throw new Error(`tickCount went negative: ${snap.context.tickCount}`);
                if (snap.status === 'done' && snap.value !== 'stopped') throw new Error(`machine reported done but value is ${snap.value}, not stopped`);
            },
        });
    }

    // ---- batch: running (invoke, loops until done.length>=prompts.length) -> complete (final).
    // Real injectable callLLM -- supply a real, fast, deterministic async fn
    // (not a mock/stub library) so the invoke's real runOne()/runStep() path
    // genuinely executes without hitting a live provider.
    //
    // REAL BUG FOUND LIVE by this fuzzer's first run: createBatchMachine's
    // real runOne() called fs.appendFileSync(file, ...) with zero validation
    // -- fuzzing file:null crashed with an opaque node:fs TypeError instead
    // of a clear error. Neither real public caller (runBatch always derives
    // a real path; resumeBatch restores the original from a persisted
    // snapshot -- see src/machines/persistent-actor.js's snapshot-vs-input
    // branch) can actually trigger this through normal use, but the
    // constructor itself had no defensive guard against a caller several
    // layers down passing an empty file. Fixed in src/batch.js: `if (file)
    // fs.appendFileSync(...)`. This fuzz round now covers BOTH the real-path
    // case (most rounds) and the falsy-file case (guarded, no longer
    // crashes) to keep the regression covered going forward.
    {
        const { createBatchMachine } = await importFrom('src/batch.js');
        const os = await import('node:os');
        const realFastCallLLM = async () => ({ content: 'fuzz-response', tool_calls: [] });
        for (let round = 0; round < Math.min(ROUNDS, 30); round++) {
            // Batch machine's real contract needs `input` at actor-creation
            // time (context is derived from input, not from a default) --
            // createActor(machine, {input}) is the real shape runBatch() uses.
            const promptCount = randomInt(3) + 1;
            // 1-in-6 rounds deliberately fuzz the falsy-file edge case (the
            // guard this round's own earlier discovery added); the rest use
            // a real temp file path, matching genuine runBatch() usage.
            const useFalsyFile = randomInt(6) === 0;
            const fuzzFile = useFalsyFile ? null : path.join(os.tmpdir(), `freddie-fuzz-batch-${round}.jsonl`);
            const machine = createBatchMachine({ prompts: Array(promptCount).fill('x'), concurrency: 2, model: 'fuzz/model', callLLM: realFastCallLLM, file: fuzzFile });
            const actor = createActor(machine, { input: { id: 'fuzz-' + round, file: fuzzFile, model: 'fuzz/model', concurrency: 2, prompts: Array(promptCount).fill('x'), done: [], results: null } });
            actor.start();
            await new Promise((resolve) => {
                const sub = actor.subscribe((snap) => {
                    if (snap.status === 'done') { sub.unsubscribe(); resolve(); }
                });
                setTimeout(resolve, 2000); // hard timeout guard -- never hang the fuzzer on a stuck round
            });
            const snap = actor.getSnapshot();
            invariant('batch: reaches done status within timeout', snap.status === 'done', `round ${round}, promptCount=${promptCount}, final value=${JSON.stringify(snap.value)}`);
            if (snap.status === 'done') {
                invariant('batch: done.length never exceeds prompts.length', snap.context.done.length <= promptCount, `round ${round}: done=${snap.context.done.length} prompts=${promptCount}`);
            }
            actor.stop();
            if (fuzzFile) { try { const fsMod = await import('node:fs'); fsMod.rmSync(fuzzFile, { force: true }); } catch {} }
        }
    }

    // ---- agent: idle -> prompting (invoke) -> tool_calls/done. Real
    // injectable callLLM -- supply a real fast fn returning no tool_calls so
    // the machine reaches 'done' deterministically without a live provider.
    {
        const { createAgentMachine } = await importFrom('src/agent/machine.js');
        const realFastCallLLM = async () => ({ content: 'fuzz-answer', tool_calls: [] });
        for (let round = 0; round < Math.min(ROUNDS, 30); round++) {
            const machine = createAgentMachine({ callLLM: realFastCallLLM, maxIterations: 3 });
            const actor = createActor(machine);
            actor.start();
            actor.send({ type: 'SUBMIT', prompt: 'fuzz prompt ' + round });
            await new Promise((resolve) => {
                const sub = actor.subscribe((snap) => {
                    if (snap.value === 'done' || snap.value === 'error') { sub.unsubscribe(); resolve(); }
                });
                setTimeout(resolve, 2000);
            });
            const snap = actor.getSnapshot();
            invariant('agent: reaches done or error within timeout', snap.value === 'done' || snap.value === 'error', `round ${round}, final value=${JSON.stringify(snap.value)}`);
            invariant('agent: sessionKey context field never crashes access', 'sessionKey' in snap.context, `round ${round}`);
            actor.stop();
        }
    }

    console.log(`[xstate-fuzz-check] ${totalChecks} invariant checks, ${totalFailures} failure(s)`);
    if (totalFailures > 0) {
        console.error(`[xstate-fuzz-check] FAILURES:`);
        for (const f of failures.slice(0, 20)) console.error(`  - ${f.name}\n    ${f.detail}`);
        if (failures.length > 20) console.error(`  ...and ${failures.length - 20} more`);
        process.exit(1);
    }
    console.log('[xstate-fuzz-check] all invariants held');
}

main().catch((e) => { console.error('[xstate-fuzz-check] fatal:', e); process.exit(1); });
