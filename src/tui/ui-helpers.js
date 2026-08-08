// UI-layer helpers for the pi-tui shell: transcript rendering, status text,
// toast notices, and the approval/ask-question prompt channels. Pure
// presentation glue over the shared `state`/`tui`/`transcript` objects
// constructed in app.js — no turn-lifecycle or input-key logic here.
import { Text, Markdown } from '@earendil-works/pi-tui'
import { getConfigValue } from '../config.js'
import { resolveApproval } from '../agent/live-turns.js'
import { markdownTheme } from './theme.js'
import { style } from './style.js'
import { gitBadge } from './git-badge.js'

export const summarizeArgs = (args) => {
    try { const s = typeof args === 'string' ? args : JSON.stringify(args); return s.length > 120 ? s.slice(0, 117) + '...' : s } catch { return '' }
}

// Session-message content is a string or an array of parts; history render
// only shows user/assistant text (tool traffic from past turns is noise).
export const contentToText = (c) => typeof c === 'string' ? c
    : Array.isArray(c) ? c.filter(p => p && p.type === 'text').map(p => p.text || '').join('') : ''

// Builds the full set of render/notify helpers bound to one TUI instance's
// mutable state. Returned as a bag so app.js and the input-handling module
// can share the same closures without duplicating them.
export function createUiHelpers({ tui, transcript, status, skin, state }) {
    let started = false
    const markStarted = () => { started = true }
    const render = () => { if (started) tui.requestRender() }
    const refresh = () => { status.invalidate(); render() }

    const statusText = () => {
        if (state.toastText) return state.toastText
        if (state.pendingApproval) return `APPROVAL PENDING: ${state.pendingApproval.name} — [y/enter]es [n/esc]o [a]lways (or ↑/↓ + enter)`
        if (state.pendingAsk) return `question ${state.pendingAsk.i + 1}/${state.pendingAsk.questions.length} — type an answer, enter submits`
        const model = getConfigValue('agent.model', '') || 'auto'
        const bits = [
            state.turnActive ? 'busy' : 'ready',
            `session ${state.session ? state.session.slice(0, 8) : '…'}`,
            `model ${model}`,
            `approval ${state.approvalMode || getConfigValue('agent.approval_mode', 'off')}`,
        ]
        const badge = gitBadge(process.cwd())
        if (badge) bits.push(badge)
        if (state.planMode) bits.push('plan')
        if (state.queuedMessages.length) bits.push(`queued ${state.queuedMessages.length}`)
        bits.push(state.turnActive ? 'enter queues · ctrl+s steers now · ↑ recalls queued · ctrl+c cancels' : '/help · ctrl+c quits')
        return bits.join(' | ')
    }

    // Transient status-bar notice (kimi's toast()) — shows for durationMs then
    // reverts to the normal status line. Used for ignored/blocked input so the
    // user gets feedback instead of a silent no-op.
    const toast = (text, durationMs = 3000) => {
        if (state.toastTimer) clearTimeout(state.toastTimer)
        state.toastText = text
        state.toastTimer = setTimeout(() => { state.toastText = null; refresh() }, durationMs)
        refresh()
    }

    const note = (text, color = style.dim) => {
        transcript.addChild(new Text(color(text), 1, 0))
        render()
    }
    const addUserLine = (text) => {
        transcript.addChild(new Text(style.bold(skin.branding.prompt_symbol) + style.bold(text), 1, 1))
        render()
    }
    const addAssistantBlock = (text) => {
        transcript.addChild(new Text(style.dim(skin.branding.response_label.trim()), 1, 1))
        transcript.addChild(new Markdown(text, 1, 0, markdownTheme))
        render()
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

    // Approval prompt: a transcript line plus y/n/a keys (input listener
    // consumes them while state.pendingApproval is set). Foreground
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

    // The loader sits between transcript and editor while a turn runs;
    // tui.children is a plain array (Container.children), spliced directly.
    // loader/editor are bound here (constructed alongside this helper bag
    // in app.js) rather than passed per-call.
    const makeSetBusy = (loader, editor) => (busy) => {
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

    return {
        markStarted, render, refresh, statusText, toast, note,
        addUserLine, addAssistantBlock, renderHistory,
        askApproval, answerApproval, showAskQuestion, answerAsk, makeSetBusy,
    }
}

// Approval choice cursor for arrow/enter navigation (kimi's
// should_handle_running_prompt_key: up/down/enter/1-3 alongside y/n/a).
export const APPROVAL_CHOICES = ['y', 'n', 'a']
