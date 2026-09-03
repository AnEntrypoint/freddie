import { clearSteps } from '../machines/step-journal.js'
import { wireHookBridge } from './wire_hooks.js'
import { telemetry } from '../observability/telemetry.js'
import { emitTurnEvent } from './events.js'
import { unregisterTurn } from './live-turns.js'
import { writeTrajectory, autoLearnTurn } from './turn_trajectory.js'
import { mergeHookExtras, timeoutResult } from './turn_helpers.js'
import { redactSecrets } from '../auth.js'
import { HookEngine } from './hooks_engine.js'
import { loadConfig } from '../config.js'

// h.hooks.invoke (plugsdk's PluginRunner-driven dispatch, src/host/contract.js)
// has no built-in per-hook timeout of its own -- unlike hookEngine.runHooks,
// which bounds each shell-hook command via its own timeout (default 30s).
// A bare `await h.hooks.invoke(...)` in this file's cleanup sequences hangs
// forever if a plugin's onTurnEnd/onSessionEnd handler returns a promise that
// never settles (a hung fetch, a deadlock, any third-party plugin bug --
// freddie explicitly supports `freddie plugin install npm:<pkg>|git:<url>`) --
// this is the SAME "unbounded await with nothing timing it out" class the
// autoRecall preamble fix already solved for a different call site
// (machine.js's AUTORECALL_TIMEOUT_MS), applied here for hook cleanup calls.
// Cleanup runs AFTER the turn has already ended/timed out, so a short bound
// (not turnMs-scale) is correct: a stalled hook is abandoned, never left to
// block resolve(out) — the turn's own side effects already happened; only
// this observability cleanup is at risk of hanging.
const HOOK_CLEANUP_TIMEOUT_MS = 5000
function boundedHookInvoke(h, name, data) {
    if (!h?.hooks) return Promise.resolve(null)
    let timer
    return Promise.race([
        h.hooks.invoke(name, data).finally(() => clearTimeout(timer)),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`hook ${name} timed out after ${HOOK_CLEANUP_TIMEOUT_MS}ms`)), HOOK_CLEANUP_TIMEOUT_MS) }),
    ]).catch(() => null)
}

// session-end hooks + trajectory. Shared by runTurn (fresh) and resumeTurn
// (rehydrated from a persisted snapshot after a refresh/restart).
async function driveAgentActor({ pa, h, hookEngine, events, prompt, provider, model, skill, cwd, witnessPath, timeoutMs, sessionKey, store, abortController }) {
    const { actor } = pa
    return await new Promise((resolve, reject) => {
        let sub
        const cleanup = () => { try { sub?.unsubscribe() } catch {} ; try { unregisterTurn(sessionKey) } catch { /* swallow: registry teardown is best-effort */ } ; pa.flush().catch(() => {}).finally(() => { try { actor.stop() } catch {} }) }
        let settled = false
        // timeoutMs===Infinity (or any non-finite/non-positive value) means
        // "no per-turn ceiling" -- the interactive TUI/REPL surfaces pass this
        // when a human is present and can Ctrl-C manually (cancelTurn is a
        // fully separate mechanism from this timer, see turn-steering.js --
        // it aborts via the live turn registry's own abortController, never
        // via this setTimeout, so skipping the timer here does not weaken
        // Ctrl-C). setTimeout(fn, Infinity) does NOT mean "never fires" --
        // Node clamps any delay exceeding the 32-bit signed int range
        // (~24.8 days) down to 1ms (live-verified: a real Node process
        // logs a TimeoutOverflowWarning and fires almost immediately), so
        // the ONLY correct way to express "unbounded" is skipping timer
        // creation entirely, not passing a large/Infinite delay value.
        const noTimeout = !Number.isFinite(timeoutMs) || timeoutMs <= 0
        const t = noTimeout ? null : setTimeout(() => {
            if (settled) return; settled = true
            telemetry.turnForceStopped({ reason: 'timeout', timeoutMs })
            emitTurnEvent(sessionKey, 'session.error', { reason: 'timeout', timeoutMs })
            const out = timeoutResult(actor, timeoutMs)
            // Stopping the xstate actor (inside cleanup, below) only halts the
            // state machine — any fromPromise invoke genuinely in flight (an LLM
            // HTTP call, a tool subprocess) keeps running against real I/O with
            // nothing left awaiting it unless the turn's AbortController is
            // fired. abort() must never itself throw into this handler — a
            // listener-side error must not block the rest of timeout cleanup.
            try { abortController?.abort(new Error('agent turn timeout')) } catch {}
            cleanup()
            ;(async () => {
                // cleanup() above only unsubscribes + flushes (pa.flush(), not
                // pa.forget()) before stopping the actor -- actor.stop() halts the
                // state machine directly rather than driving it through a real
                // transition to a final state, so createPersistentActor's own
                // subscribe callback (which clears the snapshot on snap.status
                // !== 'active') never fires for a timed-out turn. The last
                // snapshot persisted before timeout therefore keeps
                // status='active' in machine_snapshots for this (kind='agent',
                // key=sessionKey) -- DELIBERATELY, not left over by accident: a
                // caller that wants multi-hour/multi-day work (a turn timeout
                // exists to catch a genuinely STUCK turn within a bounded window,
                // not to cap legitimate long-running progress) can resumeTurn()
                // against this exact snapshot and continue from wherever the
                // xstate machine last transitioned, the same recovery path
                // resumeAll() (src/machines/resume.js) already uses for a
                // process crash/restart -- a snapshot last-persisted mid an
                // in-flight tool_call re-invokes that tool's fromPromise src
                // fresh on resume (xstate v5 cannot serialize/resurrect a live
                // promise), an already-accepted risk for the crash-recovery
                // path this reuses, not a new one. timeoutResult()'s own
                // synthetic pairing above stays purely cosmetic for the
                // IMMEDIATELY RETURNED out.messages (what a caller displays
                // right now); it has no bearing on what resumeTurn rehydrates,
                // since that reads the actor snapshot directly, never out.messages.
                //
                // The step journal needs the IDENTICAL carve-out the xstate
                // snapshot already gets above: out.resumable means this timeout
                // is not a real end, only a bounded window's ceiling -- clearing
                // the journal here (as an earlier version of this file did
                // unconditionally) breaks two things at once, both live-
                // reproduced. (1) runStep's own at-most-once cache (step-
                // journal.js's whole reason for existing) is defeated:
                // resumeTurn's rehydrated context.iterations re-enters the SAME
                // iteration number, so its 'llm:'+N/'tool:'+N+':'+tcid step IDs
                // land on rows that were just deleted, re-running an LLM call
                // and tool calls that had already completed and cost real
                // spend/side-effects moments earlier. (2) any caller using
                // listSteps(sessionKey) as a resume-loop progress signal (TUI/
                // REPL's stuck-turn detector) sees the count reset to ~0 on
                // every single resumable timeout regardless of real work done,
                // producing the exact false-positive "stopped making progress"
                // stop this mechanism exists to avoid -- caught by adversarial
                // review before shipping. Only a genuinely final (non-resumable)
                // timeout clears the journal; a resumable one leaves it intact
                // so the NEXT resumeTurn call's runStep hits its cache correctly
                // and any progress-counting caller sees real growth.
                if (!out.resumable) { try { await clearSteps(sessionKey, { store }) } catch {} }
                // onTurnEnd hook: fire when turn completes (timeout path)
                await boundedHookInvoke(h, 'onTurnEnd', { reason: 'timeout', iterations: out.iterations })
                try { const hE = new HookEngine({ config: loadConfig() }); hE.runHooks('onTurnEnd', { sessionKey, cwd, reason: 'timeout', iterations: out.iterations }).catch(() => {}) } catch {}
                try { wireHookBridge.forwardHook('onTurnEnd', { sessionKey, reason: 'timeout', iterations: out.iterations }).catch(() => {}) } catch {}
                await boundedHookInvoke(h, 'onSessionEnd', { reason: 'timeout', iterations: out.iterations })
                try { hookEngine.runHooks('onSessionEnd', { sessionKey, cwd, reason: 'timeout', iterations: out.iterations }).catch(() => {}) } catch {}
                try { wireHookBridge.forwardHook('onSessionEnd', { sessionKey, cwd, reason: 'timeout', iterations: out.iterations }).catch(() => {}) } catch {}
                try { await writeTrajectory(out, { prompt, provider, model, skill, cwd, events, errorStack: null, witnessPath }) } catch {}
            })().catch(() => {}).finally(() => resolve(out))
        }, timeoutMs)
        // Do not let a pending turn-timeout timer keep the event loop alive or fire
        // during process teardown after the awaiting caller has already moved on.
        if (typeof t?.unref === 'function') t.unref()
        sub = actor.subscribe(snap => { if (snap.status !== 'done') return; if (settled) return; settled = true; clearTimeout(t)
            ;(async () => {
                const out = snap.output
                telemetry.turnEnded({ iterations: out.iterations, result: out.result ? 'ok' : (out.error ? 'error' : 'empty'), error: out.error || null })
                if (out.error) {
                    emitTurnEvent(sessionKey, 'session.error', { error: redactSecrets(out.error), iterations: out.iterations })
                }
                emitTurnEvent(sessionKey, 'session.end', { result: out.result ? 'ok' : (out.error ? 'error' : 'empty'), error: out.error ? redactSecrets(out.error) : null, iterations: out.iterations })
                // onTurnEnd hook: fire when turn completes (normal path)
                await boundedHookInvoke(h, 'onTurnEnd', { reason: out?.error ? 'error' : 'ok', iterations: out?.iterations })
                hookEngine.runHooks('onTurnEnd', { sessionKey, cwd, reason: out?.error ? 'error' : 'ok', iterations: out?.iterations }).catch(() => {})
                wireHookBridge.forwardHook('onTurnEnd', { sessionKey, reason: out?.error ? 'error' : 'ok', iterations: out?.iterations }).catch(() => {})
                const outbound = await boundedHookInvoke(h, 'onMessageOutbound', { content: out?.result || '' })
                hookEngine.runHooks('onMessageOutbound', { sessionKey, cwd }).catch(() => {})
                wireHookBridge.forwardHook('onMessageOutbound', { sessionKey, cwd, content: out?.result || '' }).catch(() => {})
                if (outbound?.systemMessage || outbound?.additionalContext) out.messages = mergeHookExtras(out.messages || [], outbound, 'onMessageOutbound')
                await boundedHookInvoke(h, 'onSessionEnd', { reason: out?.error ? 'error' : 'ok', iterations: out?.iterations })
                hookEngine.runHooks('onSessionEnd', { sessionKey, cwd, reason: out?.error ? 'error' : 'ok', iterations: out?.iterations }).catch(() => {})
                wireHookBridge.forwardHook('onSessionEnd', { sessionKey, cwd, reason: out?.error ? 'error' : 'ok', iterations: out?.iterations }).catch(() => {})
                const errorStack = out?.error ? (events.find(e => e.type === 'llm_call' && !e.ok)?.stack || null) : null
                await writeTrajectory(out, { prompt, provider, model, skill, cwd, events, errorStack, witnessPath })
                // Auto-learn: memorize a salient summary of this turn into gm rs-learn so
                // freddie learns from each substantive turn. Best-effort, deduped, capped.
                await autoLearnTurn({ prompt, out })
                // Completed turn leaves no step-journal residue.
                await clearSteps(sessionKey, { store })
                // Unsubscribe, flush the final snapshot (persistent-actor clears it on
                // the done state) + stop the actor — a finished actor should not be
                // left running with live subscriptions/handles.
                cleanup()
                resolve(out)
            })().catch(e => { cleanup(); reject(e) })
        })
    })
}

export { driveAgentActor }
