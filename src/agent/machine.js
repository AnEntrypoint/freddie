import { bootHost } from '../host/index.js'
import { createPersistentActor } from '../machines/persistent-actor.js'
import { randomUUID } from 'node:crypto'
import { HookEngine } from './hooks_engine.js'
import { wireHookBridge } from './wire_hooks.js'
import { loadConfig, getConfigValue } from '../config.js'
import { telemetry } from '../observability/telemetry.js'
import { emitTurnEvent } from './events.js'
import { claimTurn, mergeTurnEntry, unregisterTurn, getTurn, registerTurn, loadApprovalGrants } from './live-turns.js'
import { createAgentMachine } from './machine_builder.js'
import { mergeHookExtras } from './turn_helpers.js'
import { driveAgentActor } from './turn_driver.js'
import { redactSecrets } from '../auth.js'

export { createAgentMachine }

// Default agent.approval_tools gate list — the tools that pause for a human
// (approval_mode:'mutating') or the classifier (approval_mode:'classifier')
// before dispatch. credential_files is a member because its `get` action
// returns a raw provider credential as the tool result: under any non-'off'
// approval_mode a production deployment turns on specifically to gate
// unattended tool calls, a credential read must be gated exactly like every
// other mutating tool, not exempt from the policy it was designed to enforce.
// Single source of truth for both runTurn and resumeTurn below — they must
// stay byte-identical, so this constant (not two inline array literals) is
// the fix for that sync requirement, not just this one gap.
const DEFAULT_APPROVAL_TOOLS = ['bash', 'write', 'edit', 'file_operations', 'code_execution', 'process_registry', 'cronjob', 'terminal', 'skills_hub', 'skills_sync', 'credential_files']

export async function runTurn({ prompt, messages = [], model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations = 90, timeoutMs = 30000, cwd, skill, witnessPath, sessionKey, toolCtx = null, tool_choice, store, approvalMode = null, approvalTimeoutMs = null } = {}) {
    const events = [];
    // Atomic claim-before-await: claimTurn's turns.has+turns.set pair runs
    // synchronously in this same microtask, so it is the actual TOCTOU fix --
    // a bare getTurn() read-then-later-registerTurn() pairing (the prior
    // shape) leaves an open window across the ~130-line async preamble below
    // (hooks, autoRecall, wire-log search) where two concurrent callers for
    // the same explicit sessionKey (plugins/wire/plugin.js's handle(msg) is
    // deliberately unawaited, so two rapid 'prompt' frames sharing one
    // sessionId both pass a pre-preamble check before either registers) both
    // proceed through the full preamble -- hooks fire twice, wire
    // session.created/session.start/message.append events emit twice --
    // before a later registerTurn call finally throws. claimTurn reserves the
    // key up front so the SECOND caller bails here, before any side effect.
    // Only meaningful for an explicit sessionKey -- a fresh session
    // (randomUUID() minted below) can never collide with a concurrent caller.
    let claimed = null
    if (sessionKey) {
        claimed = claimTurn(sessionKey)
        if (!claimed) return { messages, result: null, error: `turn already live for session ${sessionKey}`, iterations: 0 }
    }
    // Wire telemetry: load config to check enabled state and configure
    const cfg = loadConfig()
    if (cfg.telemetry?.enabled) {
        telemetry._enabled = true
        telemetry._endpoint = cfg.telemetry.endpoint || null
        telemetry._freddieHome = (await import('../home.js')).getFreddieHome()
        telemetry.setSession(sessionKey || '')
        telemetry.setTurn(sessionKey || '')
        telemetry.turnStarted({ prompt, model, provider })
    }
    const h = await bootHost()
    const hookEngine = new HookEngine({ config: loadConfig() })
    await h.hooks.invoke('onSessionStart', { prompt, model, provider, skill, cwd })
    hookEngine.runHooks('onSessionStart', { sessionKey, cwd }).catch(() => {})
    wireHookBridge.forwardHook('onSessionStart', { sessionKey, cwd, prompt }).catch(() => {})
    // Persist the turn snapshot under kind=agent so an interrupted turn (process
    // refresh mid-tool-call) resumes exactly where it stopped via resumeTurn.
    // Declared BEFORE restoreTasks below -- previously it sat ~25 lines further
    // down, so this call hit the TDZ, threw a ReferenceError swallowed by its own
    // catch, and task restore silently never ran.
    const key = sessionKey || randomUUID()
    // A fresh session (no caller-supplied sessionKey) has no claim yet -- claim
    // it now under its minted key. registerTurn's own guard makes this
    // effectively unreachable (randomUUID collision), but claiming here keeps
    // exactly one code path (mergeTurnEntry below) responsible for filling in
    // the real actor/control, instead of a fresh-session branch and an
    // explicit-sessionKey branch diverging.
    if (!claimed) claimed = claimTurn(key)
    if (!claimed) return { messages, result: null, error: `turn already live for session ${key}`, iterations: 0 }
    // Restore and reconcile tasks from prior sessions so background tasks
    // from a resumed session are properly tracked and stale ones detected.
    try {
        const { restoreTasks } = await import('../../plugins/task/registry.js')
        await restoreTasks(key)
    } catch (_) {}
    let initMessages = [...messages]; const sysParts = []
    // Act-don't-narrate directive (user-witnessed stall: weak models answer
    // open-ended build prompts with a plan and zero tool calls, ending the
    // turn — kimi-cli's prompt drives action instead). Gated on having any
    // toolsets enabled so contact-facing distributions (enabledToolsets: [])
    // keep their conversational behavior.
    if ((enabledToolsets ?? ['core']).length) sysParts.push('You are an autonomous coding agent. ACT, do not narrate: use your tools directly to accomplish the task (create and edit files, run commands) instead of describing a plan or asking which options to pick — make reasonable choices yourself. After each tool result, keep going until the task is fully done. Only stop when the work is complete or genuinely blocked.')
    if (cwd) sysParts.push(`Working directory: ${cwd}. Always pass cwd="${cwd}" to bash tool calls. When reading or writing files use paths relative to this directory or absolute paths under it.`)
    if (skill) { const sd = h.pi.skills.get(skill); const skillText = sd?.content || sd?.body; if (skillText) sysParts.push('Skill context:\n' + skillText) }
    // Auto-recall on turn entry: surface salient learned memories for this prompt from gm
    // rs-learn (freddie's primary learning store). Best-effort; never blocks the turn --
    // bounded by AUTORECALL_TIMEOUT_MS so a hung/unreachable gm-learn backend degrades to
    // "no memories surfaced this turn" instead of stalling the whole preamble (live-witnessed:
    // an unhealthy backend hung this call 20-30+s with no internal timeout of its own, and
    // this happens BEFORE driveAgentActor's own timeoutMs timer is armed, so runTurn's
    // configured turn timeout provided zero protection against it).
    try {
        const { autoRecall, projectNamespace } = await import('../learn/gm-learn.js')
        const AUTORECALL_TIMEOUT_MS = 4000
        let autorecallTimer
        const hits = await Promise.race([
            (async () => autoRecall(prompt, { limit: 5, namespace: await projectNamespace() }))().finally(() => clearTimeout(autorecallTimer)),
            new Promise((_, reject) => { autorecallTimer = setTimeout(() => reject(new Error('autoRecall timeout')), AUTORECALL_TIMEOUT_MS) }),
        ])
        // Weak models were witnessed answering FROM this block instead of the new
        // user message below it (asked to remember a number, answered a prior
        // turn's unrelated question instead) -- the plain "Relevant memories:"
        // label gave no signal that this is background reference material, not
        // the current instruction. Explicit priority framing fixes it.
        if (hits.length) sysParts.push('Background context from past conversations (gm rs-learn) -- for reference only, does not describe the current task:\n' + hits.map(h => '- ' + h.text).join('\n') + '\n\nThe user\'s actual request for THIS turn follows below and takes priority over the above.')
    } catch (_) {}
    // Verbatim-span recall: exact excerpts from past sessions' wire logs matching
    // the prompt's terms (locate-and-transcribe, never paraphrased). Complements
    // the embedding recall above — similarity finds related facts, this finds
    // the literal prior occurrence.
    try {
        const { searchWireLogs } = await import('./events.js')
        const spans = searchWireLogs(prompt, { limit: 3 })
        if (spans.length) sysParts.push('Verbatim excerpts from past session logs matching this prompt (exact quotes, background reference only):\n' + spans.map(s => `- [${s.ts?.slice(0, 10)} ${s.role}] ${s.text}`).join('\n'))
    } catch (_) {}
    if (sysParts.length) initMessages.unshift({ role: 'user', content: sysParts.join('\n\n') })
    const inbound = await h.hooks.invoke('onMessageInbound', { content: prompt })
    hookEngine.runHooks('onMessageInbound', { sessionKey, cwd }).catch(() => {})
    wireHookBridge.forwardHook('onMessageInbound', { sessionKey, cwd, content: prompt }).catch(() => {})
    if (inbound?.behavior === 'block') { await h.hooks.invoke('onSessionEnd', { reason: 'prompt_blocked' }); unregisterTurn(key); return { messages: initMessages, result: null, error: 'prompt blocked by plugsdk hook: ' + (inbound.reason || 'denied'), iterations: 0 } }
    initMessages = mergeHookExtras(initMessages, inbound, 'onMessageInbound')
    // cwd must reach file-path tool handlers (write/read/edit) via toolCtx, not
    // just the system-prompt text above -- those handlers resolve relative paths
    // with bare fs calls against process.cwd(), so without this every relative
    // path silently lands in the freddie server's own cwd instead of the
    // caller's intended project directory (only `bash` was safe, since it takes
    // cwd as an explicit tool argument the model was told to pass).
    // askUser is opt-in per caller, NOT injected unconditionally here: batch
    // (src/batch.js) and cron (src/cron/scheduler.js) call runTurn with no
    // toolCtx at all, and registerTurn now always runs (pendingQuestion:null
    // seeded above) — so an unconditional askUser would make requestQuestion
    // create a genuinely pending promise nothing will ever resolve for a
    // detached turn, hanging it until timeoutMs instead of the tool being
    // correctly hidden by machine_builder.js's toolCtx?.askUser schema
    // filter. Interactive surfaces (wire, gui-agent, REPL) pass their own
    // askUser in toolCtx explicitly.
    const mergedToolCtx = {
        sessionKey: key,
        ...(cwd ? { cwd } : {}),
        ...(toolCtx || {}),
    }
    // Turn control plane: shared by reference with the live-turns registry so
    // wire/WS/REPL surfaces can steer, cancel, and resolve approvals against
    // the running turn. approvalPolicy off = pre-existing behavior (no gate).
    const control = {
        steers: [],
        // agent.approval_mode (off|mutating|classifier|all) is the gate mode; the older
        // agent.approval_policy OBJECT ({yolo,afk,auto_approve}) stays as the
        // session-state bag — its auto_approve list seeds this turn's
        // pre-approved tools so the two conventions compose. The approvalMode
        // arg (e.g. REPL /approve) overrides config for this turn only.
        // approvalTimeoutMs arg likewise (REPL foreground passes Infinity —
        // kimi 1.40's reversal: a present human never gets auto-rejected).
        approvalPolicy: approvalMode || getConfigValue('agent.approval_mode', 'off'),
        approvalTimeoutMs: approvalTimeoutMs ?? getConfigValue('agent.approval_timeout_ms', 120000),
        mutatingTools: new Set(getConfigValue('agent.approval_tools', DEFAULT_APPROVAL_TOOLS)),
        approvedTools: new Set([...(getConfigValue('agent.approval_policy', {})?.auto_approve || []), ...(await loadApprovalGrants(cwd))]),
        toolBudgets: getConfigValue('agent.tool_budgets', {}),
        lastSig: null, streak: 0,
        // Classifier-tier state (agent.approval_mode: 'classifier'): denial
        // counters + escalation latch (see approval_classifier.js header).
        // classifierCallLLM stays null until the first gated call resolves it
        // lazily; verification scripts inject a stub here instead.
        classifierDenials: 0, classifierConsecDenials: 0, classifierEscalated: false,
        classifierCallLLM: null,
    }
    // Per-turn AbortController: the one cancellation handle a timeout can use to
    // actually stop in-flight I/O (LLM HTTP call, tool subprocess), not just the
    // xstate actor. Threaded into mergedToolCtx (so tool handlers like bash read
    // ctx.signal) and into the machine's fromPromise invokes below (so the LLM
    // call can race it). driveAgentActor's cleanup() calls abort() on timeout.
    const abortController = new AbortController()
    mergedToolCtx.signal = abortController.signal
    const machine = createAgentMachine({ model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations, events, sessionKey: key, toolCtx: mergedToolCtx, tool_choice, store, control, h, hookEngine, wireHookBridge, signal: abortController.signal })
    const pa = await createPersistentActor(machine, { kind: 'agent', key, input: { messages: initMessages }, store })
    // The atomic claim happened synchronously at claimTurn() above, before any
    // await in this function -- that is the actual TOCTOU fix (see the
    // claimTurn call site's comment). This call only fills in the fields the
    // placeholder didn't have yet. A null return means the entry was removed
    // from under us (unregisterTurn ran concurrently, e.g. a cancel racing
    // setup) -- surface that as the same "turn no longer live" shape rather
    // than silently resurrecting a stale entry.
    if (!mergeTurnEntry(key, { actor: pa.actor, control, abortController })) {
        return { messages, result: null, error: `turn no longer live for session ${key}`, iterations: 0 }
    }
    // onTurnStart hook: fire when turn begins
    await h.hooks.invoke('onTurnStart', { sessionKey: key, prompt, model, provider })
    hookEngine.runHooks('onTurnStart', { sessionKey: key, cwd }).catch(() => {})
    wireHookBridge.forwardHook('onTurnStart', { sessionKey: key, prompt }).catch(() => {})
    pa.actor.send({ type: 'SUBMIT', prompt })
    // Emit session.created only for new sessions (not resumes)
    if (!sessionKey) emitTurnEvent(key, 'session.created', redactSecrets({ prompt, model, provider }))
    emitTurnEvent(key, 'session.start', redactSecrets({ prompt, model, provider }))
    emitTurnEvent(key, 'message.append', { role: 'user', content: redactSecrets(prompt) })
    return await driveAgentActor({ pa, h, hookEngine, events, prompt, provider, model, skill, cwd, witnessPath, timeoutMs, sessionKey: key, store, abortController })
}

// Rehydrate an interrupted turn from its persisted snapshot and drive it to
// completion. Returns null if no live snapshot exists for the key (already
// completed or never persisted) — caller falls back to a fresh runTurn.
export async function resumeTurn({ sessionKey, model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations = 90, timeoutMs = 30000, cwd, skill, witnessPath, toolCtx = null, store } = {}) {
    if (!sessionKey) throw new Error('resumeTurn requires sessionKey')
    // Same atomic-claim-before-await shape as runTurn above: claimTurn's
    // turns.has+turns.set pair is synchronous, closing the TOCTOU window the
    // prior getTurn()-then-later-registerTurn() pairing left open across this
    // function's own await chain (loadApprovalGrants, createPersistentActor).
    const claimed = claimTurn(sessionKey)
    if (!claimed) return null
    const events = []; const h = await bootHost()
    const hookEngine = new HookEngine({ config: loadConfig() })
    // wireHookBridge for resumeTurn follows same pattern as runTurn
    wireHookBridge.forwardHook('onSessionStart', { sessionKey, cwd }).catch(() => {})
    const control = {
        steers: [],
        // agent.approval_mode (off|mutating|classifier|all) is the gate mode; the older
        // agent.approval_policy OBJECT ({yolo,afk,auto_approve}) stays as the
        // session-state bag — its auto_approve list seeds this turn's
        // pre-approved tools so the two conventions compose.
        approvalPolicy: getConfigValue('agent.approval_mode', 'off'),
        approvalTimeoutMs: getConfigValue('agent.approval_timeout_ms', 120000),
        mutatingTools: new Set(getConfigValue('agent.approval_tools', DEFAULT_APPROVAL_TOOLS)),
        approvedTools: new Set([...(getConfigValue('agent.approval_policy', {})?.auto_approve || []), ...(await loadApprovalGrants(cwd))]),
        toolBudgets: getConfigValue('agent.tool_budgets', {}),
        lastSig: null, streak: 0,
        // Classifier-tier state (agent.approval_mode: 'classifier'): denial
        // counters + escalation latch (see approval_classifier.js header).
        // classifierCallLLM stays null until the first gated call resolves it
        // lazily; verification scripts inject a stub here instead.
        classifierDenials: 0, classifierConsecDenials: 0, classifierEscalated: false,
        classifierCallLLM: null,
    }
    // Per-turn AbortController — same rationale as runTurn above.
    const abortController = new AbortController()
    const mergedToolCtx = { ...(toolCtx || {}), signal: abortController.signal }
    const machine = createAgentMachine({ model, provider, callLLM, enabledToolsets, disabledToolsets, maxIterations, events, sessionKey, toolCtx: mergedToolCtx, store, control, h, hookEngine, wireHookBridge, signal: abortController.signal })
    // createPersistentActor.load() already handles a missing/stale snapshot and
    // leaves pa.resumed=false, so the prior pre-check load() was a redundant
    // second read that opened a TOCTOU window (a concurrent delete between the two
    // reads made forget() delete a snapshot we had just confirmed). One read only.
    const pa = await createPersistentActor(machine, { kind: 'agent', key: sessionKey, input: { messages: [] }, store })
    if (!pa.resumed) { unregisterTurn(sessionKey); await pa.forget(); return null }
    if (!mergeTurnEntry(sessionKey, { actor: pa.actor, control, abortController })) {
        await pa.forget()
        return null
    }
    // onTurnStart hook: fire when resumed turn begins
    await h.hooks.invoke('onTurnStart', { sessionKey, model, provider })
    hookEngine.runHooks('onTurnStart', { sessionKey, cwd }).catch(() => {})
    wireHookBridge.forwardHook('onTurnStart', { sessionKey }).catch(() => {})
    return await driveAgentActor({ pa, h, hookEngine, events, prompt: '', provider, model, skill, cwd, witnessPath, timeoutMs, sessionKey, store, abortController })
}

export { invokeCompactHooks } from './compact_hooks.js'
