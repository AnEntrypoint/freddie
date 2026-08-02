import { exec } from 'node:child_process'
import {
    CombinedAutocompleteProvider, Container, Editor, Key, Loader, Markdown,
    ProcessTerminal, Text, TUI, matchesKey,
} from '@earendil-works/pi-tui'
import { runTurn } from '../agent/machine.js'
import { subscribeTurn, cancelTurn, resolveApproval, queueTurn, drainQueue } from '../agent/live-turns.js'
import { getConfigValue } from '../config.js'
import { resolveCommand } from '../commands/registry.js'
import { getActiveSkin } from '../skin/engine.js'
import { createSession, appendMessage } from '../sessions.js'
import { HANDLERS, PLAN_DISABLED, SLASH_COMMAND_DOCS } from './commands.js'
import { editorTheme, markdownTheme } from './theme.js'
import { style } from './style.js'
import { StatusLine } from './components.js'

const summarizeArgs = (args) => {
    try { const s = typeof args === 'string' ? args : JSON.stringify(args); return s.length > 120 ? s.slice(0, 117) + '...' : s } catch { return '' }
}

// Session-message content is a string or an array of parts; history render
// only shows user/assistant text (tool traffic from past turns is noise).
const contentToText = (c) => typeof c === 'string' ? c
    : Array.isArray(c) ? c.filter(p => p && p.type === 'text').map(p => p.text || '').join('') : ''

// The pi-tui interactive surface for `freddie run`. Same turn engine, same
// wire events, same slash commands as the readline REPL — the TUI is just
// another wire client with a richer layout: scrollable transcript (Markdown
// assistant blocks stream live), tool status lines, a multi-line editor,
// and a status bar. Resolves when the user quits.
export async function runTui({ callLLM = null, resume = null } = {}) {
    const skin = getActiveSkin()
    const state = { messages: [], session: null, exit: false, planMode: false, approvalMode: null, turnActive: false, pendingApproval: null, pendingAsk: null }

    const tui = new TUI(new ProcessTerminal())
    const transcript = new Container()
    const editor = new Editor(tui, editorTheme, { paddingX: 1 })
    editor.setAutocompleteProvider(new CombinedAutocompleteProvider(
        Object.keys(HANDLERS).map(name => ({ name, description: SLASH_COMMAND_DOCS[name] })),
        process.cwd(),
    ))
    const status = new StatusLine(() => statusText())
    const loader = new Loader(tui, s => style.cyan(s), s => style.dim(s), 'working…')

    tui.addChild(new Text(`${skin.branding.welcome} ${style.dim('— /help for commands · enter sends · shift+enter adds a line · ctrl+c cancels/quits')}`, 1, 0))
    tui.addChild(transcript)
    tui.addChild(editor)
    tui.addChild(status)

    let resolveDone
    const done = new Promise(r => { resolveDone = r })
    let quitting = false
    const quit = () => {
        if (quitting) return
        quitting = true
        tui.stop()
        resolveDone()
    }

    const statusText = () => {
        if (state.pendingApproval) return `APPROVAL PENDING: ${state.pendingApproval.name} — [y]es [n]o [a]lways`
        if (state.pendingAsk) return `question ${state.pendingAsk.i + 1}/${state.pendingAsk.questions.length} — type an answer, enter submits`
        const model = getConfigValue('agent.model', '') || 'auto'
        const bits = [
            state.turnActive ? 'busy' : 'ready',
            `session ${state.session ? state.session.slice(0, 8) : '…'}`,
            `model ${model}`,
            `approval ${state.approvalMode || getConfigValue('agent.approval_mode', 'off')}`,
        ]
        if (state.planMode) bits.push('plan')
        bits.push(state.turnActive ? 'enter queues · /steer injects · ctrl+c cancels' : '/help · ctrl+c quits')
        return bits.join(' | ')
    }
    const refresh = () => { status.invalidate(); tui.requestRender() }

    const note = (text, color = style.dim) => {
        transcript.addChild(new Text(color(text), 1, 0))
        tui.requestRender()
    }
    const addUserLine = (text) => {
        transcript.addChild(new Text(style.bold(skin.branding.prompt_symbol) + style.bold(text), 1, 1))
        tui.requestRender()
    }
    const addAssistantBlock = (text) => {
        transcript.addChild(new Text(style.dim(skin.branding.response_label.trim()), 1, 1))
        transcript.addChild(new Markdown(text, 1, 0, markdownTheme))
        tui.requestRender()
    }
    // Rebuild the visible transcript from state.messages (/resume, --resume).
    const renderHistory = () => {
        transcript.clear()
        for (const m of state.messages) {
            const text = contentToText(m.content)
            if (!text) continue
            if (m.role === 'user') addUserLine(text)
            else if (m.role === 'assistant') addAssistantBlock(text)
        }
        refresh()
    }

    // The loader sits between transcript and editor while a turn runs;
    // tui.children is a plain array (Container.children), spliced directly.
    const setBusy = (busy) => {
        const i = tui.children.indexOf(loader)
        if (busy && i < 0) {
            tui.children.splice(tui.children.indexOf(editor), 0, loader)
            loader.start()
        } else if (!busy && i >= 0) {
            loader.stop()
            tui.children.splice(i, 1)
        }
        refresh()
    }

    // Approval prompt: a transcript line plus y/n/a keys (input listener
    // below consumes them while state.pendingApproval is set). Foreground
    // surface: a present human never gets auto-rejected (kimi 1.40
    // reversal) — runTurn gets approvalTimeoutMs: Infinity.
    let approvalLine = null
    const askApproval = (data) => {
        state.pendingApproval = data
        approvalLine = new Text(style.yellow(`  [approval] ${data.name} ${summarizeArgs(data.args)}`) + style.dim(' — [y]es / [n]o / [a]lways'), 1, 0)
        transcript.addChild(approvalLine)
        refresh()
    }
    const answerApproval = (a) => {
        const data = state.pendingApproval
        if (!data) return
        state.pendingApproval = null
        const approved = a !== 'n'
        if (approvalLine) approvalLine.setText(style.dim(`  [approval ${a === 'a' ? 'always' : approved ? 'yes' : 'no'}] ${data.name}`))
        approvalLine = null
        resolveApproval(state.session, { id: data.id, approved, always: a === 'a', feedback: approved ? null : 'rejected in TUI' }).catch(() => {})
        refresh()
    }

    // ask_user_question channel: questions render into the transcript and
    // plain submits are consumed as answers until all are resolved (the
    // REPL uses rl.question; here the editor is the input line).
    const showAskQuestion = () => {
        const ask = state.pendingAsk
        const q = ask.questions[ask.i]
        const opts = Array.isArray(q.options) && q.options.length
            ? '\n' + q.options.map((o, j) => `    ${j + 1}) ${o.label}${o.description ? ' — ' + o.description : ''}`).join('\n') + `\n  (answer with a number${q.multi_select ? ' (comma-separated)' : ''} or free text)` : ''
        note(`  [question ${ask.i + 1}/${ask.questions.length}] ${q.question}${opts}`, style.yellow)
        refresh()
    }
    const answerAsk = (line) => {
        const ask = state.pendingAsk
        const q = ask.questions[ask.i]
        const t = line.trim()
        const num = parseInt(t, 10)
        let val = t
        if (Array.isArray(q.options) && q.options.length && Number.isFinite(num) && num >= 1 && num <= q.options.length) {
            val = q.options[num - 1].label
        } else if (q.multi_select && t.includes(',')) {
            val = t.split(',').map(s => {
                const n = parseInt(s.trim(), 10)
                return (Array.isArray(q.options) && Number.isFinite(n) && q.options[n - 1]) ? q.options[n - 1].label : s.trim()
            })
        }
        ask.answers[q.question] = val
        ask.i++
        if (ask.i >= ask.questions.length) {
            state.pendingAsk = null
            ask.resolve(ask.answers)
        } else {
            showAskQuestion()
        }
        refresh()
    }

    // Raw mode delivers Ctrl-C as data (\x03), not SIGINT — intercept it
    // ahead of the editor: reject a pending approval, else cancel the
    // running turn (kimi's cancel), else quit.
    tui.addInputListener((data) => {
        if (matchesKey(data, Key.ctrl('c'))) {
            if (state.pendingApproval) answerApproval('n')
            else if (state.turnActive && cancelTurn(state.session)) note('(cancel requested — turn will stop at the next step boundary)')
            else quit()
            return { consume: true }
        }
        // A pending approval owns y/n/a (and escape = no) until resolved.
        if (state.pendingApproval) {
            if (matchesKey(data, 'y')) { answerApproval('y'); return { consume: true } }
            if (matchesKey(data, 'n') || matchesKey(data, Key.escape)) { answerApproval('n'); return { consume: true } }
            if (matchesKey(data, 'a')) { answerApproval('a'); return { consume: true } }
        }
    })

    editor.onSubmit = (text) => { void onLine(text) }

    async function onLine(raw) {
        const line = raw.trim()
        if (!line) return
        editor.addToHistory(raw)

        // An open question owns the editor until every question is answered.
        if (state.pendingAsk) { answerAsk(line); return }

        // Shell escape (kimi's Ctrl-X shell mode): run a local command
        // without leaving the session.
        if (line.startsWith('!')) {
            const cmd = line.slice(1).trim()
            if (!cmd) return
            note(`  $ ${cmd}`)
            exec(cmd, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                if (stdout) note(stdout.replace(/\n$/, ''))
                if (stderr) note(stderr.replace(/\n$/, ''), style.yellow)
                if (err && !stdout && !stderr) note(`(exit ${err.code ?? 'error'})`, style.red)
            })
            return
        }

        if (line.startsWith('/')) {
            const parts = line.slice(1).split(/\s+/)
            const name = resolveCommand('/' + parts[0]) || parts[0]
            const handler = HANDLERS[name]
            if (!handler) { note(`unknown command: /${parts[0]}`, style.yellow); return }
            try { const out = await handler(state, parts.slice(1)); if (out) note(out) }
            catch (e) { note(`error: ${e.message}`, style.red) }
            if (name === 'clear') transcript.clear()
            if (name === 'resume') renderHistory()
            refresh()
            if (state.exit) quit()
            return
        }

        // Mid-turn input QUEUES for after the turn (kimi 1.31's Enter
        // channel); /steer <text> injects. Approvals/questions are answered
        // through their own channels above, not as prompt text.
        if (state.turnActive) {
            queueTurn(state.session, line)
            note('  [queued — runs after this turn; /steer <text> to inject now]')
            return
        }

        await runPrompt(line)
    }

    // One full turn: persist the prompt, stream progress/deltas into the
    // transcript, run, render. Drains the follow-up queue at the end.
    async function runPrompt(line) {
        addUserLine(line)
        await appendMessage(state.session, { role: 'user', content: line })

        // Live turn surface — the same wire events the REPL subscribes to.
        const toolLines = new Map()
        let assistantMd = null
        let assistantAcc = ''
        let sawDelta = false
        const openAssistant = () => {
            if (assistantMd) return
            transcript.addChild(new Text(style.dim(skin.branding.response_label.trim()), 1, 1))
            assistantMd = new Markdown('', 1, 0, markdownTheme)
            transcript.addChild(assistantMd)
        }
        const unsub = subscribeTurn(state.session, (env) => {
            if (env.event === 'assistant.delta') {
                sawDelta = true
                assistantAcc += env.data.text || ''
                openAssistant()
                assistantMd.setText(assistantAcc)
            } else if (env.event === 'tool.start') {
                const l = new Text(style.dim(`  ⠿ ${env.data.name} ${summarizeArgs(env.data.args)}`), 1, 0)
                toolLines.set(env.data.toolCallId, { line: l, name: env.data.name })
                transcript.addChild(l)
            } else if (env.event === 'tool.end') {
                const t = toolLines.get(env.data.toolCallId)
                if (t) t.line.setText(style.dim(`  ${env.data.denied ? '✗' : '✓'} ${t.name}${env.data.denied ? ' (denied)' : ''}`))
            } else if (env.event === 'approval.request') {
                askApproval(env.data)
            } else if (env.event === 'steer.append') {
                note(`  [steer] ${env.data.text}`)
            }
            tui.requestRender()
        })
        state.turnActive = true
        setBusy(true)
        try {
            const out = await runTurn({
                prompt: line,
                messages: state.messages,
                callLLM,
                timeoutMs: 600000,
                sessionKey: state.session,
                cwd: process.cwd(),
                approvalMode: state.approvalMode,
                // Foreground surface: a present human never gets
                // auto-rejected (kimi 1.40 reversal).
                approvalTimeoutMs: Infinity,
                disabledToolsets: state.planMode ? PLAN_DISABLED : undefined,
                // ask_user_question stays schema-visible here because a
                // channel exists (elsewhere the machine hides the tool).
                toolCtx: {
                    askUser: (questions) => new Promise((resolve) => {
                        state.pendingAsk = { questions, answers: {}, i: 0, resolve }
                        showAskQuestion()
                    }),
                },
            })
            state.messages = out.messages
            const reply = out.result || out.error || '(no response)'
            // Deltas already streamed the reply live; only render it whole
            // when the turn took the non-streaming path.
            if (!sawDelta) addAssistantBlock(reply)
            await appendMessage(state.session, { role: 'assistant', content: reply })
        } catch (e) {
            note(`error: ${e.message}`, style.red)
        } finally {
            state.turnActive = false
            setBusy(false)
            try { unsub() } catch { /* swallow: listener already gone */ }
        }
        // Queued follow-ups (typed mid-turn) run next, in order.
        for (const q of drainQueue(state.session)) await runPrompt(q)
    }

    // Resume a prior conversation when requested (--resume [id]); otherwise
    // start a fresh session. sessions.js is async (libsql) and MUST be
    // awaited — a bare call silently wraps in a rejecting Promise so the row
    // is never persisted and history is lost.
    if (resume !== null && resume !== false) {
        const msg = await HANDLERS.resume(state, typeof resume === 'string' ? [resume] : [])
        note(msg)
        renderHistory()
    }
    if (!state.session) state.session = await createSession({ platform: 'cli' })

    tui.setFocus(editor)
    tui.start()
    refresh()
    return done
}
