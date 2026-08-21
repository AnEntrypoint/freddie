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

// session-end hooks + trajectory. Shared by runTurn (fresh) and resumeTurn
// (rehydrated from a persisted snapshot after a refresh/restart).
async function driveAgentActor({ pa, h, hookEngine, events, prompt, provider, model, skill, cwd, witnessPath, timeoutMs, sessionKey, store }) {
    const { actor } = pa
    return await new Promise((resolve, reject) => {
        let sub
        const cleanup = () => { try { sub?.unsubscribe() } catch {} ; try { unregisterTurn(sessionKey) } catch { /* swallow: registry teardown is best-effort */ } ; pa.flush().catch(() => {}).finally(() => { try { actor.stop() } catch {} }) }
        let settled = false
        const t = setTimeout(() => {
            if (settled) return; settled = true
            telemetry.turnForceStopped({ reason: 'timeout', timeoutMs })
            emitTurnEvent(sessionKey, 'session.error', { reason: 'timeout', timeoutMs })
            const out = timeoutResult(actor, timeoutMs)
            cleanup()
            ;(async () => {
                try { await clearSteps(sessionKey, { store }) } catch {}
                // onTurnEnd hook: fire when turn completes (timeout path)
                try { await h.hooks.invoke('onTurnEnd', { reason: 'timeout', iterations: out.iterations }) } catch {}
                try { const hE = new HookEngine({ config: loadConfig() }); hE.runHooks('onTurnEnd', { sessionKey, cwd, reason: 'timeout', iterations: out.iterations }).catch(() => {}) } catch {}
                try { wireHookBridge.forwardHook('onTurnEnd', { sessionKey, reason: 'timeout', iterations: out.iterations }).catch(() => {}) } catch {}
                try { await h.hooks.invoke('onSessionEnd', { reason: 'timeout', iterations: out.iterations }) } catch {}
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
                await h.hooks.invoke('onTurnEnd', { reason: out?.error ? 'error' : 'ok', iterations: out?.iterations })
                hookEngine.runHooks('onTurnEnd', { sessionKey, cwd, reason: out?.error ? 'error' : 'ok', iterations: out?.iterations }).catch(() => {})
                wireHookBridge.forwardHook('onTurnEnd', { sessionKey, reason: out?.error ? 'error' : 'ok', iterations: out?.iterations }).catch(() => {})
                const outbound = await h.hooks.invoke('onMessageOutbound', { content: out?.result || '' })
                hookEngine.runHooks('onMessageOutbound', { sessionKey, cwd }).catch(() => {})
                wireHookBridge.forwardHook('onMessageOutbound', { sessionKey, cwd, content: out?.result || '' }).catch(() => {})
                if (outbound?.systemMessage || outbound?.additionalContext) out.messages = mergeHookExtras(out.messages || [], outbound, 'onMessageOutbound')
                await h.hooks.invoke('onSessionEnd', { reason: out?.error ? 'error' : 'ok', iterations: out?.iterations })
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
