import readline from 'node:readline'
import { exec } from 'node:child_process'
import { runTurn, resumeTurn } from '../agent/machine.js'
import { subscribeTurn, cancelTurn, resolveApproval, steerTurn, queueTurn, drainQueue, getTurn } from '../agent/live-turns.js'
import { listSteps } from '../machines/step-journal.js'
import { getConfigValue } from '../config.js'
import { resolveCommand, COMMANDS_BY_CATEGORY } from '../commands/registry.js'
import { getActiveSkin } from '../skin/engine.js'
import { createSession, appendMessage, listSessions, listSessionsWithSummary, getMessages } from '../sessions.js'
import { listAllProfiles, switchProfile } from '../commands/profile.js'
import { listAuthProviders, hasUsableSecret, envForProvider } from '../auth.js'
import { listProjects, getActiveProject, setActiveProject } from '../projects.js'
import { listSubagents } from '../../plugins/core/delegate/store.js'
import { goalCommand } from '../commands/goal.js'
import { skillsListCommand, resolveSkillInvocation } from '../commands/skills_command.js'
import { flowCommandHandler } from '../../plugins/flow_skill/handler.js'
import { loadHistory, saveHistory } from './repl_history.js'

// Tools disabled in plan mode (read-only turn): mutation-capable tools are
// hidden from the model so it can inspect (bash/read/grep stay) but not
// change anything — kimi's plan-mode enforcement, toolset-level.
const PLAN_DISABLED = ['write', 'edit', 'file_operations', 'code_execution']

const summarizeArgs = (args) => {
    try { const s = typeof args === 'string' ? args : JSON.stringify(args); return s.length > 120 ? s.slice(0, 117) + '...' : s } catch { return '' }
}

// REPL slash-command handlers. Each returns a string to print (or sets
// state.exit / mutates state for resume). Handlers may be async — the line
// loop awaits them.
const HANDLERS = {
    help: () => {
        const out = []
        for (const [cat, cmds] of Object.entries(COMMANDS_BY_CATEGORY)) {
            out.push(`\n# ${cat}`)
            for (const c of cmds) out.push(`  /${c.name}${c.args_hint ? ' ' + c.args_hint : ''}\t${c.description}`)
        }
        out.push('\n# Conversation\n  /sessions\tList recent conversations\n  /resume <id>\tContinue a past conversation\n  /subagents\tList active/recent fan-out subagents\n  /keys\tShow which provider keys are set\n  /project [name]\tShow or switch active project\n  /approve [off|mutating|all]\tShow or set the approval mode for this REPL\n  /plan\tToggle plan mode (read-only turns)\n  /cancel\tInterrupt the running turn\n  /steer <text>\tInject a message into the running turn (plain text mid-turn queues for after it)\n  !<cmd>\tRun a local shell command')
        return out.join('\n')
    },
    quit: (state) => { state.exit = true; return 'bye.' },
    profile: (_s, args) => {
        if (!args[0] || args[0] === 'list') return listAllProfiles().join('\n')
        if (args[0] === 'switch' && args[1]) { switchProfile(args[1]); return 'switched: ' + args[1] }
        return 'usage: /profile [list|switch <name>]'
    },
    sessions: async () => {
        const rows = await listSessions(20)
        if (!rows.length) return '(no sessions yet)'
        return rows.map(s => `  ${s.id.slice(0, 8)}  ${new Date(s.updated_at).toISOString().slice(0, 16).replace('T', ' ')}  ${s.title || '(untitled)'}`).join('\n')
    },
    subagents: async () => {
        const rows = await listSubagents()
        if (!rows.length) return '(no subagents yet)'
        return rows
            .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
            .slice(0, 20)
            .map(s => `  ${s.agent_id}  [${s.status}]  depth=${s.depth ?? '?'}  ${s.subagent_type || '?'}  ${s.description || s.task?.slice(0, 60) || ''}`)
            .join('\n')
    },
    resume: async (state, args) => {
        const wanted = args[0]
        let target
        if (!wanted) {
            // No explicit id -- per direct user request, browse instead of
            // silently picking the most recent session. This surface has a
            // real readline interface (no nav-mode keys the way the pi-tui
            // side has), so a numbered list + rl.question is the natural
            // equivalent interaction: type a number, or blank for most-
            // recent (row 1), same zero-friction default as before for
            // anyone who just wants the fast path.
            // Gate BEFORE the async listSessionsWithSummary call, not after
            // -- live-verified via a minimal readline reproduction that
            // piped/non-TTY stdin delivers ALL buffered lines as their own
            // 'line' events regardless of an in-flight async handler; a
            // gate installed only after the DB query resolves leaves a real
            // window where lines typed/piped immediately after '/resume'
            // (e.g. the picker's own answer + a following '/quit') race
            // ahead and get dispatched as ordinary commands by the SAME
            // 'line' listener re-entering concurrently, before this
            // handler ever reaches its own picker prompt. A pending-queue
            // array (not a single resolver) absorbs every line that lands
            // during setup, so the FIRST one queued (or one typed later,
            // whichever comes first) becomes the real answer with nothing
            // lost or misrouted in between.
            const pendingLines = []
            state.pendingLineResolver = (raw) => pendingLines.push(raw)
            const rows = await listSessionsWithSummary(50)
            if (!rows.length) { state.pendingLineResolver = null; return '(no sessions to resume)' }
            if (!state.rl) {
                state.pendingLineResolver = null
                target = rows[0] // no interactive prompt channel available
            } else {
                const lines = rows.map((s, i) => {
                    const when = Number.isFinite(s.updated_at) ? new Date(s.updated_at).toISOString().slice(0, 16).replace('T', ' ') : ''
                    const preview = (s.title || (typeof s.last_content === 'string' ? s.last_content : '') || '(empty)').replace(/\s+/g, ' ').trim().slice(0, 60)
                    return `  ${String(i + 1).padStart(2)}) ${s.id.slice(0, 8)}  ${String(s.message_count ?? 0).padStart(4)} msgs  ${when}  ${preview}`
                }).join('\n')
                state.rl.output.write(`Resume which session? (${rows.length})\n${lines}\n  > number, or blank for most recent, 'c' to cancel: `)
                const answer = pendingLines.length
                    ? pendingLines.shift()
                    : await new Promise((resolve) => { state.pendingLineResolver = resolve })
                state.pendingLineResolver = null
                // Any FURTHER lines that raced in during setup (e.g. an
                // answer plus a following command typed/piped back-to-back)
                // are real input the picker never should have consumed --
                // replay them through the normal 'line' path once this
                // handler is done, in original order, rather than silently
                // dropping them. setImmediate defers each replay past this
                // handler's own return (the outer 'line' listener is still
                // awaiting this async function; emitting synchronously here
                // would recurse into it before it unwinds).
                for (const leftover of pendingLines) setImmediate(() => state.rl.emit('line', leftover))
                const t = answer.trim()
                if (t.toLowerCase() === 'c' || t.toLowerCase() === 'cancel') return 'resume cancelled'
                const num = t ? parseInt(t, 10) : 1
                target = Number.isFinite(num) && num >= 1 && num <= rows.length ? rows[num - 1] : rows[0]
            }
        } else {
            const rows = await listSessions(50)
            if (!rows.length) return '(no sessions to resume)'
            target = rows.find(s => s.id === wanted || s.id.startsWith(wanted))
            if (!target) return `no session matching: ${wanted}`
        }
        const msgs = await getMessages(target.id)
        state.session = target.id
        state.messages = msgs.map(m => ({ role: m.role, content: m.content, tool_calls: m.tool_calls || undefined, tool_call_id: m.tool_call_id || undefined }))
        return `resumed ${target.id.slice(0, 8)} (${msgs.length} messages) — ${target.title || '(untitled)'}`
    },
    keys: async () => {
        const lines = []
        for (const p of listAuthProviders()) {
            const ok = await hasUsableSecret(p)
            lines.push(`  ${p.padEnd(12)} ${envForProvider(p) || ''}\t${ok ? '[set]' : '[--]'}`)
        }
        return lines.join('\n')
    },
    project: (_s, args) => {
        if (!args[0]) {
            const active = getActiveProject()
            return listProjects().map(p => `  ${p.name === active.name ? '[*]' : '[ ]'} ${p.name.padEnd(16)} ${p.path}`).join('\n')
        }
        try { const p = setActiveProject(args[0]); return `switched to project: ${p.name} (${p.path})\nrestart the REPL to load this project's plugins` }
        catch (e) { return 'error: ' + e.message }
    },
    clear: (state) => { state.messages = []; return 'cleared.' },
    approve: (state, args) => {
        const mode = args[0]
        if (!mode) return `approval mode: ${state.approvalMode || getConfigValue('agent.approval_mode', 'off')} (usage: /approve off|mutating|classifier|all)`
        if (!['off', 'mutating', 'classifier', 'all'].includes(mode)) return 'usage: /approve off|mutating|classifier|all'
        state.approvalMode = mode
        return `approval mode for this REPL: ${mode}${mode === 'off' ? '' : ' — gated tool calls will ask before running'}`
    },
    plan: (state) => {
        state.planMode = !state.planMode
        return `plan mode ${state.planMode ? 'ON — mutation tools hidden (' + PLAN_DISABLED.join(', ') + ')' : 'OFF'}`
    },
    cancel: (state) => {
        if (!state.turnActive) return 'no turn running'
        return cancelTurn(state.session) ? 'cancel requested (takes effect at the next step boundary)' : 'no live turn found for this session'
    },
    steer: (state, args) => {
        const text = args.join(' ')
        if (!text) return 'usage: /steer <text> — inject a message into the running turn'
        if (!state.turnActive) return 'no turn running (plain text while a turn runs queues for after it)'
        return steerTurn(state.session, text) ? 'steer injected at the next step boundary' : 'no live turn found for this session'
    },
    goal: (state, args) => goalCommand(state.session, args),
    skills: () => skillsListCommand(),
    skill: async (state, args) => {
        const { error, message } = resolveSkillInvocation(args)
        if (error) return error
        await state.runPrompt(message.content)
        return ''
    },
    // Shorthand for /skill gm — the gm skill is common enough (and its slash
    // form familiar from Claude Code) to warrant a direct alias rather than
    // requiring the generic /skill <name> form for this one case.
    gm: (state, args) => HANDLERS.skill(state, ['gm', ...args]),
    flow: (state, args) => flowCommandHandler(state, args),
}

export async function interactive({ callLLM, resume = null, input = process.stdin, output = process.stdout, forceTerminal = false } = {}) {
    const skin = getActiveSkin()
    const state = { messages: [], session: null, exit: false, planMode: false, approvalMode: null, turnActive: false, linesReceived: 0 }
    // Up-arrow history, persisted per project folder (cwd) so switching
    // repos doesn't mix unrelated prompt history together, and surviving
    // across sessions (readline's own `history` array is in-memory only).
    // Constructed BEFORE the --resume handling below (not after, as an
    // earlier version of this file had it) -- HANDLERS.resume's no-
    // explicit-id session-browse picker needs state.rl to prompt via its
    // own pendingLineResolver mechanism, and its own `if (!state.rl)`
    // fallback-to-most-recent branch would otherwise ALWAYS fire at
    // startup regardless of terminal capability, since state.rl was still
    // undefined at that call site -- live-reported: `--resume` never
    // showed the picker on start, exactly this bug.
    const historyCwd = process.cwd()
    const rl = readline.createInterface({ input, output, terminal: forceTerminal || input.isTTY, history: loadHistory(historyCwd) })
    // Attached to state so HANDLERS.resume can prompt via its own
    // pendingLineResolver mechanism for its no-explicit-id session-browse
    // path (same convention as the pi-tui surface attaching its own `ui`
    // bag to state -- see app.js).
    state.rl = rl
    const persistHistory = () => saveHistory(rl.history, historyCwd)
    const prompt = () => { if (!state.exit && !rl.closed) rl.setPrompt(skin.branding.prompt_symbol); if (!rl.closed) rl.prompt() }

    // Ctrl-C always exits immediately, even mid-turn -- per direct user
    // request, the prior two-stage design (first ctrl+c cancels the running
    // turn, a SECOND ctrl+c once idle actually quits) read as "ctrl+c
    // doesn't work" to a user who just wants out right now. cancelTurn()
    // still fires first (best-effort, fire-and-forget) so an in-flight LLM/
    // tool call gets its abort signal and settles cleanly if it can --
    // rl.close() does not wait on it, and print_mode.js/commands-runtime.js's
    // teardownAndExit tears down whatever handles are left regardless of
    // turn state.
    rl.on('SIGINT', () => {
        if (state.turnActive) { state.stopResumeChain = true; cancelTurn(state.session) }
        rl.close()
    })

    rl.on('line', async (raw) => {
        state.linesReceived += 1
        // A pending line-resolver (HANDLERS.resume's session-browse picker)
        // owns the VERY NEXT line, full stop -- checked before anything
        // else, including the blank-line/history early-returns below, so a
        // blank answer (== "pick the default", the picker's own contract)
        // reaches the resolver rather than silently no-op'ing here first.
        // rl.question() cannot be used for this: live-verified (a minimal
        // readline reproduction) that with piped/non-TTY input, EVERY
        // buffered line still fires its own 'line' event regardless of a
        // pending question() call -- the picker's answer line and any
        // FOLLOWING lines (e.g. the next /quit) race and can be delivered
        // out of order, or hit the interface after it's already closed
        // (ERR_USE_AFTER_CLOSE). Manually intercepting the next raw 'line'
        // event here, instead of nesting a second question() prompt, avoids
        // that race entirely -- there is only ever one active line-consumer
        // (readline's own emitter) at a time.
        if (state.pendingLineResolver) {
            // Deliberately does NOT null out pendingLineResolver here --
            // during the picker's own async setup window it's a queue-
            // collecting function (pushes onto an array, stays installed to
            // absorb every line that arrives before setup finishes), not a
            // one-shot Promise resolver; only HANDLERS.resume itself knows
            // which phase it's in and clears the gate once it's actually
            // done consuming an answer.
            state.pendingLineResolver(raw)
            return
        }
        const line = raw.trim()
        if (line) persistHistory()
        if (!line) return prompt()

        // Shell escape (kimi's Ctrl-X shell mode, readline-style): run a local
        // command without leaving the REPL.
        if (line.startsWith('!')) {
            const cmd = line.slice(1).trim()
            if (!cmd) return prompt()
            exec(cmd, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                if (stdout) output.write(stdout)
                if (stderr) output.write(stderr)
                if (err && !stdout && !stderr) output.write(`(exit ${err.code ?? 'error'})\n`)
                prompt()
            })
            return
        }

        if (line.startsWith('/')) {
            const parts = line.slice(1).split(/\s+/)
            const name = resolveCommand('/' + parts[0]) || parts[0]
            if (state.turnActive && name !== 'cancel' && name !== 'steer') {
                output.write(`/${parts[0]} is not available while a turn is running (use /cancel or /steer, or wait — it will queue as a message otherwise)\n`)
                return prompt()
            }
            const handler = HANDLERS[name]
            if (!handler) { output.write(`unknown command: /${parts[0]}\n`); return prompt() }
            try { output.write((await handler(state, parts.slice(1))) + '\n') }
            catch (e) { output.write(`error: ${e.message}\n`) }
            if (state.exit) rl.close()
            else prompt()
            return
        }

        // Mid-turn input: an open approval question owns the line (its own
        // once-listener consumes it). Plain text QUEUES for after the turn
        // (kimi 1.31's Enter channel); /steer <text> injects mid-turn.
        if (state.turnActive) {
            if (state.answeringApproval) return
            queueTurn(state.session, line)
            output.write('  [queued — runs after this turn; /steer <text> to inject now]\n')
            return
        }

        await runPrompt(line)
        prompt()
    })

    // One full turn: persist the prompt, stream progress/deltas, run, print.
    // Drains the follow-up queue at the end (queued mid-turn input runs next).
    async function runPrompt(line) {
        await appendMessage(state.session, { role: 'user', content: line })
        // Live turn surface: tool progress lines as they happen, approval
        // prompts answered inline — the REPL is just another wire client.
        const askApproval = (data) => {
            state.answeringApproval = true
            rl.question(`  [approval] ${data.name} ${summarizeArgs(data.args)}\n  approve? [y]es / [n]o / [a]lways: `, (ans) => {
                state.answeringApproval = false
                const a = (ans || '').trim().toLowerCase()
                const approved = a === 'y' || a === 'yes' || a === 'a' || a === 'always'
                resolveApproval(state.session, { id: data.id, approved, always: a === 'a' || a === 'always', feedback: approved ? null : 'rejected in REPL' }).catch(() => {})
            })
        }
        // Tracks whether the CURRENT in-flight LLM step already streamed text
        // via assistant.delta, so the message.append handler below doesn't
        // re-print the same step's text a second time (see its own comment).
        let stepStreamed = false
        const unsub = subscribeTurn(state.session, (env) => {
            if (env.event === 'tool.start') output.write(`  [tool] ${env.data.name} ${summarizeArgs(env.data.args)}\n`)
            else if (env.event === 'tool.end') output.write(env.data.denied ? `  [tool denied] ${env.data.name}\n` : `  [tool done] ${env.data.name}\n`)
            else if (env.event === 'subagent.spawn') output.write(`  [subagent] ${env.data.subagent_type} ${env.data.description || env.data.agent_id}${env.data.background ? ' (background)' : ''}\n`)
            else if (env.event === 'subagent.end') output.write(`  [subagent ${env.data.status}] ${env.data.agent_id}\n`)
            else if (env.event === 'approval.request') askApproval(env.data)
            else if (env.event === 'steer.append') output.write(`  [steer] ${env.data.text}\n`)
            else if (env.event === 'assistant.delta') {
                // Whitespace-only chunks don't count as streamed (see the
                // message.append guard below): marking them streamed would
                // suppress the real text that follows them.
                const delta = env.data.text || ''
                output.write(delta)
                if (delta.trim()) { state.sawLiveText = true; stepStreamed = true }
            }
            else if (env.event === 'message.append' && env.data.role === 'assistant') {
                // Same gap as the TUI (see input-handlers.js's runPrompt for the
                // full root-cause writeup): llm_resolver's path is non-streaming
                // today, so assistant.delta never fires, and only the FINAL
                // step's text used to print here -- every intermediate step's
                // prose across a multi-tool-call turn was invisible until
                // end-of-turn, printed after all of that turn's [tool]/[tool
                // done] lines had already streamed live. Print each non-empty
                // intermediate message as it happens, in its real chronological
                // position.
                //
                // Guard on stepStreamed: machine_builder.js's llm() wrapper
                // fires BOTH assistant.delta (per onChunk call) and
                // message.append (unconditionally, once the call resolves) for
                // the SAME LLM call -- nothing forbids a provider adapter from
                // doing both. If deltas already streamed this step's text to
                // stdout, printing message.append's content too would print the
                // same response a second time.
                const text = env.data.content
                if (text && text.trim() && !stepStreamed) { state.sawLiveText = true; output.write(`${skin.branding.response_label}${text}\n`) }
                stepStreamed = false
            }
        })
        state.turnActive = true
        state.sawLiveText = false
        state.stopResumeChain = false
        // askUserCloseListeners: askUser's own rl.once('close', ...) below
        // only auto-removes itself when it actually FIRES. Reused across
        // every resumeTurn call in a resume chain (toolCtx is hoisted so the
        // SAME closure serves every iteration) means a question asked more
        // than once across a long chain would otherwise accumulate one
        // never-fired listener per prior invocation. Tracked here so cleanup
        // (in the finally block below) can remove every one this runPrompt
        // call added, not just the most recent.
        const askUserCloseListeners = []
        const toolCtx = {
            askUser: (questions) => new Promise((resolve) => {
                const answers = {}
                // EOF (piped stdin ending) must not leave the promise
                // hanging or prompt() a closed interface — resolve with
                // whatever answers we have so the machine can proceed.
                const onClose = () => { state.answeringApproval = false; resolve(answers) }
                rl.once('close', onClose)
                askUserCloseListeners.push(onClose)
                const askNext = (i) => {
                    if (i >= questions.length || rl.closed) { state.answeringApproval = false; return resolve(answers) }
                    const q = questions[i]
                    const opts = Array.isArray(q.options) && q.options.length
                        ? '\n' + q.options.map((o, j) => `    ${j + 1}) ${o.label}${o.description ? ' — ' + o.description : ''}`).join('\n') + `\n  (answer with a number${q.multi_select ? ' (comma-separated)' : ''} or free text)` : ''
                    state.answeringApproval = true
                    rl.question(`  [question] ${q.question}${opts}\n  > `, (ans) => {
                        const t = (ans || '').trim()
                        const num = parseInt(t, 10)
                        let val = t
                        if (Array.isArray(q.options) && q.options.length && Number.isFinite(num) && num >= 1 && num <= q.options.length) {
                            val = q.multi_select ? [q.options[num - 1].label] : q.options[num - 1].label
                        } else if (q.multi_select && t.includes(',')) {
                            val = t.split(',').map(s => {
                                const n = parseInt(s.trim(), 10)
                                return (Array.isArray(q.options) && Number.isFinite(n) && q.options[n - 1]) ? q.options[n - 1].label : s.trim()
                            })
                        }
                        answers[q.question] = val
                        askNext(i + 1)
                    })
                }
                askNext(0)
            }),
        }
        try {
            let out = await runTurn({
                prompt: line,
                messages: state.messages,
                callLLM,
                // Foreground REPL surface: a human is present and can Ctrl-C
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
                // Foreground REPL: a present human never gets auto-rejected
                // (kimi 1.40 reversal) — the approval waits indefinitely.
                approvalTimeoutMs: Infinity,
                disabledToolsets: state.planMode ? PLAN_DISABLED : undefined,
                // Interactive channel for ask_user_question (the tool stays
                // schema-visible in the REPL because this exists; elsewhere it
                // is hidden — machine.js prompting filters it without a channel).
                toolCtx,
            })
            // A turn ending with resumable:true (the 600s-ish per-turn ceiling
            // hit, not a real crash/error) still has its xstate snapshot intact
            // -- turn_driver.js no longer clears it on this path specifically so
            // this loop can pick it back up. Chains resumeTurn calls exactly
            // like the queued-follow-up drainQueue loop below chains prompts,
            // so a genuinely multi-hour/multi-day task keeps making progress
            // across many bounded turns instead of stopping at the first one --
            // the per-turn timeout stays a real stuck-turn detector (each call
            // is still bounded) without capping the OVERALL task length.
            //
            // Two things stop the chain besides a real result: (1) the user's
            // Ctrl-C setting state.stopResumeChain (checked before every
            // resumeTurn call, not just relying on cancelTurn's own return
            // value -- see the SIGINT handler's own comment for why), and (2)
            // lastStepCount tracking whether the step journal grew across a
            // resume window. An EARLIER draft compared context.iterations
            // instead -- live-witnessed as a false positive: iterations
            // (machine_builder.js's executing_tools onDone) increments exactly
            // ONCE per full LLM-round-trip batch of tool calls, not per
            // individual tool call, so a single LLM response requesting many
            // tool calls whose combined execution exceeds timeoutMs left
            // iterations flat across a resume window even though dozens of
            // real tool calls completed. listSteps(sessionKey) counts every
            // journaled llm:N/tool:N:tcid step (step-journal.js's existing
            // idempotent-resume bookkeeping) -- a strictly finer-grained real-
            // progress signal already computed for free, so a resume window
            // that journals ANY new step (even mid-iteration) is real progress.
            // Unbounded on resumeCount alone would let a truly stuck turn loop
            // forever, silently burning tool calls/LLM spend.
            let resumeCount = 0
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
                // pick up) rather than the primary multi-day-task mechanism it
                // was before. Kept rather than removed: harmless, and
                // correctness doesn't depend on this path being unreachable.
                output.write(`\n  [turn ${resumeCount > 1 ? 'resumed again' : 'resumed'} -- continuing]\n`)
                state.sawLiveText = false
                stepStreamed = false
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
                    output.write(`\n  [resume collision -- another caller is holding this turn, retrying in ${(delay / 1000).toFixed(0)}s]\n`)
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
                        output.write(`\n  [no new steps journaled after ${resumeCount} resume(s), iteration count at ${out.iterations} -- may be a slow tool call; still resuming]\n`)
                    }
                    lastStepCount = stepCount
                }
            }
            state.messages = out.messages
            const reply = out.result || out.error || '(no response)'
            // Deltas already streamed the reply live; only print it whole when
            // the turn took the non-streaming path. But a turn that ends with
            // result:null after streaming SOME deltas (a timeout mid-turn, or
            // any other error after partial streaming) has no further content
            // coming -- printing just a bare newline silently discarded the
            // error/timeout notice entirely, leaving the REPL looking like it
            // simply stopped with no explanation.
            if (state.sawLiveText) output.write(out.result == null && out.error ? `\n${reply}\n` : '\n')
            else output.write(`${skin.branding.response_label}${reply}\n`)
            await appendMessage(state.session, { role: 'assistant', content: reply })
        } catch (e) {
            output.write(`error: ${e.message}\n`)
        } finally {
            state.turnActive = false
            state.stopResumeChain = false
            try { unsub() } catch { /* swallow: listener already gone */ }
            // Any askUser call across this runPrompt (initial or resumed)
            // that never actually got answered (e.g. the turn ended before
            // the user responded) leaves its rl.once('close', ...) listener
            // still registered -- remove every one this call added rather
            // than letting a long resume chain accumulate them.
            for (const l of askUserCloseListeners) { try { rl.removeListener('close', l) } catch { /* swallow */ } }
        }
        // Queued follow-ups (typed mid-turn) run next, in order.
        for (const q of drainQueue(state.session)) await runPrompt(q)
    }
    // Adversarial review (G_INDEP) found a real leaked-Promise hazard: EOF
    // (stdin closing) while HANDLERS.resume's picker is mid-await left its
    // pendingLineResolver's Promise permanently unsettled -- no 'close'
    // listener ever resolved it, so `await handler(state, ...)` at this
    // file's own '/' dispatch site would hang forever on a closed
    // interface. Resolving with '' on close (the picker's own contract
    // already treats an empty answer as "pick the default", never as a
    // crash) mirrors how askUser's onClose above resolves with whatever
    // partial answers exist rather than leaving its own Promise hanging.
    rl.on('close', () => {
        persistHistory()
        if (state.pendingLineResolver) { state.pendingLineResolver(''); state.pendingLineResolver = null }
        // stdin closed/EOF'd before the user ever typed a line — most likely
        // the process was not actually given an interactive stdin handle
        // (broken TTY inheritance through a wrapper like npx, or genuine
        // non-interactive invocation). Silent-exit-0 here is indistinguishable
        // from a crash; say so on stderr so it isn't mistaken for one.
        if (state.linesReceived === 0 && !state.exit) {
            process.stderr.write('freddie: stdin closed before any input was read — this process was not given an interactive terminal (common when run through a wrapper like `npx` on Windows). Try running the installed `freddie` binary directly instead of via npx, or `freddie exec --print --prompt "..."` for non-interactive use.\n')
        }
    })

    // Resume a prior conversation when requested (--resume [id]); otherwise
    // start a fresh session. Runs AFTER every rl.on(...) listener above is
    // registered (line/SIGINT/close), not before -- HANDLERS.resume's no-
    // explicit-id session-browse picker answers via the 'line' listener's
    // own pendingLineResolver interception, which does not exist yet if
    // this ran earlier; the picker's answer line would be emitted to zero
    // listeners and silently lost. createSession/listSessions are async
    // (libsql) and MUST be awaited — a bare call silently wraps in a
    // rejecting Promise so the row is never persisted and history is lost.
    if (resume !== null && resume !== false) {
        const msg = await HANDLERS.resume(state, typeof resume === 'string' ? [resume] : [])
        output.write(msg + '\n')
    }
    if (!state.session) state.session = await createSession({ platform: 'cli' })
    state.runPrompt = (line) => runPrompt(line)
    output.write(`${skin.branding.welcome}\n`)
    prompt()
    return new Promise(resolve => rl.on('close', resolve))
}
