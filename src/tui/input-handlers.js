// Input-side wiring for the pi-tui shell: raw-key interception (ctrl+c,
// approval y/n/a, ctrl+s steer, ↑ recall) and line-submit dispatch (slash
// commands, shell escape, queue/steer routing, turn execution). Depends on
// the render/notify helpers from ui-helpers.js and the turn-lifecycle
// primitives from live-turns.js/machine.js — kept separate from app.js's
// TUI-object construction so each file has one responsibility.
import { exec } from 'node:child_process'
import { runTurn, resumeTurn } from '../agent/machine.js'
import { subscribeTurn, queueTurn, drainQueue, steerTurn, getTurn } from '../agent/live-turns.js'
import { listSteps } from '../machines/step-journal.js'
import { resolveCommand } from '../commands/registry.js'
import { appendMessage } from '../sessions.js'
import { HANDLERS, PLAN_DISABLED } from './commands.js'
import { style } from './style.js'
import { summarizeError } from './ui-helpers.js'
import { saveHistory } from '../cli/repl_history.js'

export { attachInputListener } from './raw-keys.js'

// Builds the onLine (editor submit) handler, the runPrompt turn runner, and
// steerNow (also used by the raw-key ctrl+s handler). Returned bound to the
// given tui/editor/state/ui/skin/callLLM bag.
export function createLineHandlers({ tui, editor, state, ui, skin, callLLM }) {
    const steerNow = (text) => {
        ui.note(style.bold(skin.branding.prompt_symbol) + text + ' (steered)', style.cyan)
        steerTurn(state.session, text)
        ui.refresh()
    }

    async function onLine(raw) {
        const line = raw.trim()
        if (!line) return
        editor.addToHistory(raw)
        // editor.history is unshift-ordered (most-recent-first), matching
        // repl_history.js's own on-disk shape — persisted per project folder
        // (cwd) so up-arrow recall survives across freddie restarts, not
        // just within the current in-memory session.
        saveHistory(editor.history, process.cwd())

        // An open question owns the editor until every question is answered.
        if (state.pendingAsk) { ui.answerAsk(line); return }

        // Shell escape (kimi's Ctrl-X shell mode): run a local command
        // without leaving the session.
        if (line.startsWith('!')) {
            const cmd = line.slice(1).trim()
            if (!cmd) return
            ui.note(`  $ ${cmd}`)
            exec(cmd, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                if (stdout) ui.note(stdout.replace(/\n$/, ''))
                if (stderr) ui.note(stderr.replace(/\n$/, ''), style.yellow)
                if (err && !stdout && !stderr) ui.note(`(exit ${err.code ?? 'error'})`, style.red)
            })
            return
        }

        // Shell-only slash commands (session/config/nav) are misrouted if
        // queued or steered mid-turn — the shell dispatcher below is the only
        // thing that actually handles them, and it only runs when idle.
        // Mid-turn, block with a toast (kimi's toast() on InputAction.IGNORED)
        // instead of silently queueing something that will error later.
        if (line.startsWith('/') && state.turnActive) {
            ui.toast(`/${line.slice(1).split(/\s+/)[0]} is not available during streaming`)
            return
        }

        if (line.startsWith('/')) {
            const parts = line.slice(1).split(/\s+/)
            const name = resolveCommand('/' + parts[0]) || parts[0]
            const handler = HANDLERS[name]
            if (!handler) { ui.note(`unknown command: /${parts[0]}`, style.yellow); return }
            try { const out = await handler(state, parts.slice(1)); if (out) ui.note(out) }
            catch (e) { ui.note(`error: ${e.message}`, style.red) }
            // No transcript to separately clear/rebuild -- /clear already
            // emptied state.messages (commands.js) and /resume already
            // repopulated it (HANDLERS.resume), and the minimap reads
            // state.messages live on every render() call, so a plain
            // refresh picks either change up with no extra step.
            ui.refresh()
            if (state.exit) ui.quit()
            return
        }

        // Mid-turn input QUEUES for after the turn (kimi 1.31's Enter
        // channel); ctrl+s steers immediately. Approvals/questions are
        // answered through their own channels above, not as prompt text.
        if (state.turnActive) {
            queueTurn(state.session, line)
            state.queuedMessages.push(line)
            ui.note(`  ❯ ${line}`, style.dim)
            ui.note('  [queued — runs after this turn; ctrl+s to steer now, ↑ to recall]', style.dim)
            ui.refresh()
            return
        }

        await runPrompt(line)
    }

    // One full turn: persist the prompt, stream progress/deltas into the
    // minimap, run, render. Drains the follow-up queue at the end.
    async function runPrompt(line) {
        // No separate transcript echo -- the very next line seeds
        // state.liveTurnMessages with this SAME `line` as a role:'user'
        // entry, which context-minimap.js already renders as its own row
        // (applying summarizePrompt itself for a /skill invocation's
        // fully-expanded body). Echoing it here too would just duplicate
        // that row's content a second time in a separate view, which is
        // exactly what the user asked to remove: "we ONLY want a minimap."
        // Reset the live-turn accumulator for the context minimap (see
        // app.js's state.liveTurnMessages comment) -- any leftover entries
        // from a PRIOR runPrompt call already got folded into state.messages
        // when that turn resolved, so starting fresh here is correct even
        // across the drainQueue follow-up chain at the bottom of this
        // function (each queued prompt is its own runPrompt call).
        state.liveTurnMessages = [{ role: 'user', content: line }]
        await appendMessage(state.session, { role: 'user', content: line })

        // tool.start's args never reach tool.end (machine_builder.js emits
        // tool.end with only {name, toolCallId, denied?, budgetExceeded?,
        // result?} -- the args live only on the earlier tool.start event),
        // but context-minimap.js's bash-shaped-result formatter needs the
        // real invoked command/args to show alongside stdout instead of the
        // raw {exitCode,stdout,stderr} envelope -- pairing by toolCallId
        // here is the only place that association can be made. Scoped to
        // this one runPrompt call (a fresh Map per turn, including each
        // queued follow-up's own runPrompt invocation) so a toolCallId from
        // an earlier turn can never leak into a later one; unsub below
        // means no further tool.start/tool.end for this map arrive after
        // the turn ends anyway.
        const pendingToolArgs = new Map()

        // Live turn surface — the same wire events the REPL subscribes to.
        // The user's own typed prompt and every kind of turn output
        // (assistant prose, tool results) all exist ONLY as minimap rows,
        // opened on demand via ctrl+o -- there is no separate transcript
        // view to stream anything into. tool.start/subagent.spawn use
        // pushOrUpdateNotice with a stable key (toolCallId/agent_id) so the
        // in-progress "⠿ name" notice updates in place to "✓ name" on
        // completion instead of leaving two separate lines.
        // Rolling buffer of the most recent RAW stream lines (up to
        // STREAM_BUFFER_LINES) for the ephemeral live-feed notice -- per
        // direct user request ("literally everything that the llm outputs
        // as output tokens should make a real time feed... Show everything
        // as raw structured lines", "Up to 3 lines, but can be shorter if
        // there's less content"), this shows EVERY event llm_resolver.js's
        // streaming path forwards (text, tool-call construction, reasoning
        // deltas, finish markers -- see its own onChunk(text, meta) call
        // sites), not just prose text, and only ever the TAIL of the
        // current step's output (tail -f -n 3 style) rather than the whole
        // accumulated text growing unbounded on screen. The FULL raw
        // content still lands in the real, durable minimap row via
        // liveTurnMessages.push below once the step settles -- this buffer
        // is only the live, ephemeral preview. Reset to [] on every
        // message.append settle (a fresh buffer per step, never carried
        // across steps) so a later step's lines can never be silently
        // appended onto an earlier, already-settled step's content -- the
        // exact duplicate/stale-text class a naive re-implementation here
        // could reintroduce (mirrors the same step-scoped reset discipline
        // src/cli/interactive.js's own stepStreamed guard already uses for
        // its own, differently-shaped version of this problem).
        const STREAM_BUFFER_LINES = 3
        let streamBuffer = []
        const unsub = subscribeTurn(state.session, (env) => {
            if (env.event === 'assistant.delta') {
                // 'start-step' fires as the very FIRST event of every LLM
                // call, before any real text/tool-call content -- purely a
                // structural marker with zero information for a human
                // watching the feed (llm_resolver.js's generic kind:'other'
                // fallback renders it as a raw `[start-step]
                // {"type":"start-step"}` JSON dump, which was reported
                // showing up bare in the ephemeral notice instead of ever
                // threading into a real row, since a step that produces only
                // a tool call with zero streamed prose settles almost
                // immediately after this one event -- the notice briefly
                // shows nothing BUT this marker before message.append clears
                // it. Suppressed entirely (never enters the visible buffer)
                // rather than shown as if it were real stream signal;
                // finish-step/tool-call/text/reasoning kinds are all real
                // signal and stay untouched.
                if (env.data.kind === 'other' && env.data.raw?.type === 'start-step') return
                // A single delta/event's text can itself contain multiple
                // real lines (e.g. a tool-call's JSON arguments, or a
                // multi-line text-delta chunk) -- split on '\n' so the
                // 3-line tail genuinely reflects the last 3 real lines of
                // raw output, not the last 3 events regardless of how many
                // lines each spanned. Critically, most deltas are a single
                // WORD/TOKEN with no trailing newline at all (that's the
                // normal shape of a token-streamed response) -- the first
                // piece of THIS delta continues the buffer's last existing
                // line (concatenated, not pushed as a new entry) so
                // consecutive word-chunks build up one flowing line the way
                // the model's actual output reads, instead of each token
                // landing on its own line. Only a real '\n' inside the
                // delta's text starts a genuinely new buffer entry.
                const incomingLines = (env.data.text || '').split('\n')
                if (streamBuffer.length && incomingLines.length) {
                    streamBuffer[streamBuffer.length - 1] += incomingLines.shift()
                }
                streamBuffer.push(...incomingLines)
                if (streamBuffer.length > STREAM_BUFFER_LINES) streamBuffer = streamBuffer.slice(-STREAM_BUFFER_LINES)
                // Never padded to exactly 3 -- filter drops empty lines
                // (a lone '\n' in the raw stream, or the buffer's own
                // not-yet-filled state) rather than showing blank rows.
                const visible = streamBuffer.filter((l) => l.trim())
                if (visible.length) ui.noteLive('assistant-stream', visible.join('\n'), { color: style.dim })
            } else if (env.event === 'message.append' && env.data.role === 'assistant') {
                // The step has settled -- its FULL text now lands as a real
                // minimap row via liveTurnMessages.push below, which is the
                // authoritative, durable record. Clear the ephemeral
                // streaming notice for THIS step entirely (ui.clearLive, not
                // noteLive(key,'') -- the latter would leave a permanent
                // blank line in the notices trailer forever after) so it
                // doesn't linger underneath the now-settled row, and reset
                // the buffer so the NEXT step's lines start from empty
                // rather than concatenating onto this step's already-
                // flushed content.
                if (streamBuffer.length) { ui.clearLive('assistant-stream'); streamBuffer = [] }
                // Every intermediate LLM step's text becomes its own
                // liveTurnMessages entry -- context-minimap.js already reads
                // this array and renders one row per entry, so no separate
                // transcript render is needed here at all.
                state.liveTurnMessages.push({ role: 'assistant', content: env.data.content || '', tool_calls: env.data.tool_calls || [] })
            } else if (env.event === 'tool.start') {
                // No standalone progress notice here (and none on tool.end
                // below) -- a tool call's ONLY visible representation is the
                // turn's own folded minimap row (context-minimap.js), which
                // already reads state.liveTurnMessages and repaints live via
                // tui.requestRender() at the bottom of this handler. A
                // separate per-tool-call noteLive was pinning one permanent
                // line per distinct toolCallId (pushOrUpdateNotice only
                // merges SAME-key updates, so N tool calls in one turn left N
                // notices that never cleared) -- exactly the un-folded
                // clutter the row-folding fix was meant to remove, just via
                // a second, separate rendering path this file owns rather
                // than context-minimap.js's own row list. Folding a turn
                // open (ctrl+o) already reveals every member tool call
                // individually, which is the one place that detail belongs.
                // args ARE captured here (see pendingToolArgs's own comment
                // above) so tool.end below can attach the real invoked
                // command/args onto the pushed message.
                if (env.data.toolCallId) pendingToolArgs.set(env.data.toolCallId, env.data.args)
            } else if (env.event === 'tool.end') {
                // The pushed message carries the tool's name so the context
                // minimap (context-minimap.js) can label this row "tool:name"
                // instead of a bare "tool" -- that row, opened on demand, is
                // now the ONLY place this result's content is shown; it is
                // never dumped anywhere else. A DENIED call still gets a
                // member entry (name suffixed "(denied)") rather than being
                // dropped silently -- the removed noteLive call used to be
                // the ONLY place a denial was ever shown (it ran
                // unconditionally, not gated on env.data.denied), so
                // omitting it here entirely would make an approval
                // rejection / classifier denial / classifier escalation
                // (all three real tool.end{denied:true} sources, per
                // machine_builder.js) invisible to the user -- the turn
                // would silently continue with no trace the call was ever
                // blocked. The emitted event carries only {name,
                // toolCallId, denied, via?} -- the actual denial reason
                // lives in the tool_call result content sent back to the
                // model, not on this wire event -- so `via` (present only
                // for the two classifier paths, absent for a plain human
                // rejection) is the one real distinguishing detail
                // available here. A budget-exceeded skip
                // (tool.end{budgetExceeded:true}, machine_builder.js's
                // per-tool session-budget gate) is the same silent-loss
                // shape as an unhandled denial -- adversarial review
                // confirmed the original denied-only fix left this sibling
                // case falling through to the plain result branch with an
                // empty content and no indication the call was skipped, so
                // it gets the same explicit treatment here rather than
                // being rediscovered as a second instance of the identical
                // defect class.
                // args (the real invoked command/parameters, captured on
                // the earlier tool.start for this SAME toolCallId) rides
                // alongside content so context-minimap.js's formatter can
                // show what was actually called instead of just the raw
                // result envelope -- consumed (not just read) to bound the
                // map to in-flight calls only.
                const args = pendingToolArgs.get(env.data.toolCallId)
                pendingToolArgs.delete(env.data.toolCallId)
                state.liveTurnMessages.push(env.data.denied
                    ? { role: 'tool', name: `${env.data.name} (denied)`, content: env.data.via ? `denied via ${env.data.via}` : 'denied', args }
                    : env.data.budgetExceeded
                    ? { role: 'tool', name: `${env.data.name} (budget exceeded)`, content: 'tool call skipped: session budget exceeded', args }
                    : { role: 'tool', name: env.data.name, content: env.data.result ?? '', args })
            } else if (env.event === 'subagent.spawn') {
                state.liveTurnMessages.push({ role: 'tool', name: `subagent:${env.data.subagent_type}`, content: env.data.description || env.data.agent_id })
            } else if (env.event === 'subagent.end') {
                const mark = env.data.status === 'completed' ? 'OK' : env.data.status === 'timed_out' ? 'TIMEOUT' : 'FAIL'
                state.liveTurnMessages.push({ role: 'tool', name: `subagent:${env.data.subagent_type}`, content: `${mark} - ${env.data.agent_id}` })
            } else if (env.event === 'approval.request') {
                ui.askApproval(env.data)
            } else if (env.event === 'steer.append') {
                ui.note(`  [steer] ${env.data.text}`)
            } else if (env.event === 'status.update' && env.data.kind === 'context_usage') {
                // The real, exact size of the messages array that just went out
                // on the wire (machine_builder.js emits this right before its own
                // llm() call, post-decay/post-compress) -- replaces the minimap's
                // prior approach of re-estimating over its OWN held state.messages,
                // which drifts from reality the instant server-side decay/compress
                // shrinks the transcript but the client hasn't yet received the
                // updated context.messages back (only happens once per whole turn,
                // in runPrompt's `state.messages = out.messages` at the end).
                state.lastRealContextUsage = env.data.tokens
            } else if (env.event === 'status.update' && env.data.kind === 'usage_totals') {
                // Session-lifetime cumulative input/output/cache-hit totals
                // (machine_builder.js's noteUsage, real provider usage
                // preferred, freddie's own estimate as fallback -- see that
                // file's own comment for why a fallback is needed at all).
                state.lastUsageTotals = { input: env.data.input, output: env.data.output, cacheHit: env.data.cacheHit }
            }
            tui.requestRender()
        })
        state.turnActive = true
        state.stopResumeChain = false
        ui.setBusy(true)
        const toolCtx = {
            askUser: (questions) => new Promise((resolve) => {
                state.pendingAsk = { questions, answers: {}, i: 0, resolve }
                ui.showAskQuestion()
            }),
        }
        try {
            let out = await runTurn({
                prompt: line,
                messages: state.messages,
                callLLM,
                // Foreground TUI surface: a human is present and can Ctrl-C
                // (cancelTurn is a fully separate mechanism from this timeout --
                // it aborts via the live turn registry's own abortController,
                // see turn-steering.js -- so removing the per-turn ceiling here
                // does not weaken cancellation). User explicitly asked for
                // long-horizon tasks to run for days with no timeout, ever --
                // unbounded is the honest default for a surface with a present
                // operator, matching approvalTimeoutMs's own Infinity below.
                // Infinity here is NOT the same as a large finite number:
                // setTimeout clamps any delay past ~24.8 days (Node's 32-bit
                // signed int limit) down to 1ms and fires almost immediately
                // (live-verified) -- turn_driver.js's driveAgentActor treats a
                // non-finite/non-positive timeoutMs as "skip the timer
                // entirely" specifically to avoid that trap. agent.turn_timeout_ms
                // stays the default for non-interactive surfaces (ACP, gui-agent,
                // batch, cron, gateway) where no human is present to Ctrl-C a
                // genuinely stuck turn.
                timeoutMs: Infinity,
                // Same motivation as timeoutMs above -- maxIterations gates a
                // COUNT (one LLM round-trip batch of tool calls per
                // increment, machine_builder.js's tool_calls state), not
                // wall-clock time, and a genuinely long multi-day task making
                // real progress still hit a hard 'iteration budget exhausted'
                // error at the default cap of 90 round-trips.
                //
                // Number.MAX_SAFE_INTEGER, NOT Infinity: this is a DIFFERENT
                // trap than timeoutMs's setTimeout-clamp one, but the same
                // shape -- persistent-actor.js snapshots this turn's xstate
                // context to machine_snapshots via plain JSON.stringify
                // (snapshot-store.js's persist(), fired on every transition
                // while status==='active') whenever the turn resumes across
                // process boundaries (resumeAll() on restart, or this file's
                // own resumable-timeout resume loop below). JSON.stringify
                // silently converts Infinity to null (JSON has no Infinity
                // literal), and a resumed actor's context is restored
                // VERBATIM from that JSON via createActor(machine,
                // {snapshot}) -- the context factory that would otherwise
                // re-derive maxIterations from this call's own argument is
                // NEVER re-run on the resume path, so the null survives into
                // context.maxIterations. The tool_calls guard's `context.
                // iterations >= context.maxIterations` then becomes
                // `iterations >= null`, which JS coerces to `iterations >=
                // 0` -- true for every non-negative iteration count,
                // force-terminating the VERY NEXT resumed turn almost
                // immediately with the same 'iteration budget exhausted'
                // error this fix exists to remove, just far sooner (iteration
                // ~0 instead of 90). Live-verified: JSON.stringify(Infinity)
                // === null, and 0 >= null === true in JS. MAX_SAFE_INTEGER
                // (9007199254740991) is a real JSON-safe number that survives
                // the round-trip intact and is unreachable by any real
                // turn's plain integer increment (one per LLM round-trip).
                maxIterations: Number.MAX_SAFE_INTEGER,
                sessionKey: state.session,
                cwd: process.cwd(),
                approvalMode: state.approvalMode,
                // Foreground surface: a present human never gets
                // auto-rejected (kimi 1.40 reversal).
                approvalTimeoutMs: Infinity,
                disabledToolsets: state.planMode ? PLAN_DISABLED : undefined,
                // ask_user_question stays schema-visible here because a
                // channel exists (elsewhere the machine hides the tool).
                toolCtx,
            })
            // A turn ending with resumable:true (the per-turn ceiling hit, not
            // a real crash/error) still has its xstate snapshot intact --
            // turn_driver.js no longer clears it on this path specifically so
            // this loop can pick it back up, the same way the queued-follow-up
            // drainQueue loop below chains prompts. Keeps a genuinely
            // multi-hour/multi-day task making progress across many bounded
            // turns instead of stopping at the first one -- each individual
            // call stays a real stuck-turn detector without capping the
            // OVERALL task length. Each resumed sub-turn's own `ui.note`
            // marker line (below) makes it clear as a notice where one
            // bounded turn ended and the next began.
            //
            // Two things stop the chain besides a real result: (1) the user's
            // Ctrl-C setting state.stopResumeChain (raw-keys.js sets this
            // unconditionally, not gated on cancelTurn's own return value --
            // see its own comment for why: cancelTurn can find nothing to
            // cancel during the brief gap between one resumed sub-turn ending
            // and the next claiming the sessionKey), and (2) lastStepCount
            // tracking whether the step journal grew across a resume window.
            // An EARLIER draft compared context.iterations instead -- live-
            // witnessed as a false positive: iterations (machine_builder.js's
            // executing_tools onDone) increments exactly ONCE per full LLM-
            // round-trip batch of tool calls, not per individual tool call, so
            // a single LLM response requesting many tool calls whose combined
            // execution exceeds timeoutMs left iterations flat across a resume
            // window even though dozens of real tool calls completed (visible
            // as ✓ notices). listSteps(sessionKey) counts every
            // journaled llm:N/tool:N:tcid step (step-journal.js's existing
            // idempotent-resume bookkeeping) -- a strictly finer-grained real-
            // progress signal already computed for free, so a resume window
            // that journals ANY new step (even mid-iteration) is real progress.
            // Unbounded on resumeCount alone would let a truly stuck turn loop
            // forever, silently burning tool calls/LLM spend.
            let resumeCount = 0
            // Each resumed sub-turn opens its own fresh block (see the comment
            // above this loop) -- sawLiveText must reset with assistantMd/
            // assistantAcc at each resume, or a live-rendered message from an
            // EARLIER sub-turn would wrongly suppress the final block for a
            // LATER sub-turn that produced no live text of its own.
            let lastStepCount = await listSteps(state.session).then(s => s.length).catch(() => 0)
            // Tracks the real transcript across the chain independent of
            // `out` itself -- `out` gets overwritten with a synthetic
            // {messages: ???, ...} shape on every early-exit branch below
            // (stop-requested, resume-collision, no-progress), and reaching
            // back into state.messages at that point would be WRONG: it still
            // holds whatever the conversation was BEFORE this runPrompt call
            // started (state.messages is only written once, after the loop,
            // at the line below), discarding every message the initial
            // runTurn and any earlier successful resumeTurn in THIS chain
            // actually produced -- live-verified as a real defect in an
            // earlier draft of this fix (a second resumeTurn returning null
            // silently dropped the first resumeTurn's whole transcript).
            let lastMessages = out?.messages ?? state.messages
            // Collision retry: claimTurn's `turns` Map (turn-registry.js) is
            // purely in-process, so "another caller already driving it" is a
            // transient race window (freddie wire / gui-agent WS / resumeAll()
            // on boot briefly holding the same sessionKey), never a permanent
            // block -- retrying is almost always the right call, not giving up.
            // Backoff caps at 30s so a genuinely long-held collision doesn't
            // spin-hammer resumeTurn, but never stops retrying outright: the
            // user asked for long-horizon tasks to run for days without ever
            // timing out, so only Ctrl-C or a real "nothing left to resume"
            // (see below) end the chain.
            const COLLISION_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000]
            let collisionStreak = 0
            while (out?.resumable) {
                if (state.stopResumeChain) { out = { messages: lastMessages, result: null, error: 'resume chain stopped by user (Ctrl-C)' }; break }
                resumeCount += 1
                // With timeoutMs:Infinity above, runTurn itself never produces
                // resumable:true from its own timer -- this loop body is now a
                // defensive fallback (e.g. a process crash mid-turn leaving a
                // resumable snapshot for a FUTURE process's resumeAll() to
                // pick up, surfaced here if this same process somehow re-enters
                // with out.resumable already true) rather than the primary
                // multi-day-task mechanism it was before. Kept rather than
                // removed: harmless, and correctness doesn't depend on this
                // path being unreachable in practice.
                ui.note(`  [turn ${resumeCount > 1 ? 'resumed again' : 'resumed'} -- continuing]`, style.dim)
                const beforeResume = getTurn(state.session)
                const resumed = await resumeTurn({ sessionKey: state.session, callLLM, timeoutMs: Infinity, maxIterations: Number.MAX_SAFE_INTEGER, cwd: process.cwd(), disabledToolsets: state.planMode ? PLAN_DISABLED : undefined, toolCtx })
                if (!resumed) {
                    // resumeTurn returns null for two DIFFERENT reasons: no
                    // snapshot left to resume (genuinely done/gone -- the
                    // persisted turn state no longer exists, confirmed via
                    // persistent-actor.js's pa.flush() guarantee that a real
                    // timeout's snapshot write is never still in-flight when
                    // this check runs, so this is a real terminal exit, not a
                    // race), or claimTurn found another live caller already
                    // holding this sessionKey (a transient collision -- retry
                    // instead of giving up, per the "never stop" requirement).
                    if (!beforeResume) {
                        out = { messages: lastMessages, result: null, error: 'resume found no snapshot to continue from' }
                        break
                    }
                    collisionStreak += 1
                    const delay = COLLISION_BACKOFF_MS[Math.min(collisionStreak - 1, COLLISION_BACKOFF_MS.length - 1)]
                    ui.note(`  [resume collision -- another caller is holding this turn, retrying in ${(delay / 1000).toFixed(0)}s]`, style.dim)
                    await new Promise(r => setTimeout(r, delay))
                    out = { resumable: true } // keep the while condition true; loop back and retry
                    continue
                }
                collisionStreak = 0
                out = resumed
                lastMessages = out.messages
                if (out.resumable) {
                    const stepCount = await listSteps(state.session).then(s => s.length).catch(() => lastStepCount)
                    if (stepCount === lastStepCount) {
                        // A flat-progress window is a genuine slow-tool-call
                        // warning, never a hard stop -- the user explicitly
                        // wants long-horizon tasks to keep running for days.
                        // Surface it visibly so a human watching can Ctrl-C if
                        // they judge it truly stuck, but keep resuming either way.
                        ui.note(`  [no new steps journaled after ${resumeCount} resume(s), iteration count at ${out.iterations} -- may be a slow tool call; still resuming]`, style.yellow)
                    }
                    lastStepCount = stepCount
                }
            }
            state.messages = out.messages
            // out.messages is now the authoritative, complete record of
            // everything this turn did (including every message
            // liveTurnMessages was approximating live) -- clear it so the
            // minimap reads state.messages alone again until the NEXT turn
            // starts and repopulates it.
            state.liveTurnMessages = []
            const reply = out.result || out.error || '(no response)'
            // The reply itself is already part of out.messages (now
            // state.messages) -- context-minimap.js renders it as a row,
            // default-open, the same as every other assistant message this
            // turn produced (the FULL text, unsummarized, stays there for
            // anyone who opens the row). Only a genuine error with no
            // result gets an ephemeral notice: that is operational feedback
            // the user needs to see immediately, not turn content to
            // browse on demand -- summarizeError keeps it to one readable
            // line instead of dumping a provider's raw JSON error body
            // (e.g. acptoapi's BridgeError.message is often exactly that).
            if (out.result == null && out.error) ui.note(summarizeError(reply), style.red)
            await appendMessage(state.session, { role: 'assistant', content: reply })
        } catch (e) {
            ui.note(`error: ${summarizeError(e.message)}`, style.red)
        } finally {
            state.turnActive = false
            state.stopResumeChain = false
            ui.setBusy(false)
            try { unsub() } catch { /* swallow: listener already gone */ }
            // A cancelled/timed-out/crashed turn can leave the ephemeral
            // streaming notice stuck showing stale partial text forever --
            // clearLive is only otherwise called from the message.append
            // branch above, which never fires if the step never settled
            // (Ctrl-C mid-stream, a turn timeout, an uncaught error before
            // the LLM call resolved). Unconditional and idempotent
            // (removeNotice no-ops if already cleared), so this is a safe
            // catch-all regardless of how the turn actually ended.
            ui.clearLive('assistant-stream')
        }
        // Queued follow-ups (typed mid-turn) run next, in order.
        for (const q of drainQueue(state.session)) await runPrompt(q)
    }

    return { onLine, runPrompt, steerNow }
}
