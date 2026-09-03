// UI-layer helpers for the pi-tui shell: status text, ephemeral notices,
// and the approval/ask-question prompt channels. Pure presentation glue
// over the shared `state`/`tui`/`minimap` objects constructed in app.js --
// no turn-lifecycle or input-key logic here. There is no separate
// transcript Container: the minimap (context-minimap.js) is the sole
// scrolling view, so every notice-shaped line (errors, resume markers,
// approval prompts, console passthrough) routes through its
// pushNotice/pushOrUpdateNotice, never a Text node appended elsewhere.
import { getConfigValue } from '../config.js'
import { resolveApproval } from '../agent/live-turns.js'
import { style } from './style.js'
import { gitBadge } from './git-badge.js'

export const summarizeArgs = (args) => {
    try { const s = typeof args === 'string' ? args : JSON.stringify(args); return s.length > 120 ? s.slice(0, 117) + '...' : s } catch { return '' }
}

// A chain-exhausted/provider error's .message is frequently the raw JSON
// response body forwarded verbatim (acptoapi's BridgeError sets
// `this.message` straight from the provider's error text, e.g.
// '{"error":{"message":"Insufficient credits...","code":402,...}}') --
// dumping that whole blob into a notice via ui.note reads as a wall of
// unstyled JSON with no visual distinction from real content. Pulls out
// just the human-readable message when the text parses as one of the
// common {error:{message}}/{message} provider shapes, falling back to a
// length-capped version of the raw text for anything else (never silently
// drops information, only trims what's shown inline).
const ERROR_LINE_MAX = 200
export const summarizeError = (text) => {
    const raw = String(text ?? '')
    let msg = raw
    try {
        const parsed = JSON.parse(raw)
        const inner = parsed?.error?.message ?? parsed?.message
        if (typeof inner === 'string' && inner.trim()) msg = inner
    } catch { /* not JSON -- use raw text as-is */ }
    msg = msg.trim()
    return msg.length > ERROR_LINE_MAX ? msg.slice(0, ERROR_LINE_MAX - 3) + '...' : msg
}

// A /skill (or /gm) invocation's runPrompt `line` is NOT human-typed text --
// skills_command.js's resolveSkillInvocation builds it from
// skillAsUserMessage, which is `[skill:<name>]\nArguments: <args>\n\n<full
// skill body>` (gm's own SKILL.md alone runs to hundreds of lines).
// context-minimap.js applies this to a user-role message's row content, so
// a skill invocation's row shows a short label instead of dumping the
// entire skill body -- prose, gate list, anchor catalogue, all of it -- as
// if the user had typed it. The full content still reaches the LLM
// unchanged (this only affects what a row DISPLAYS); a plain typed line is
// returned unchanged since it will never match the prefix.
const SKILL_PROMPT_RE = /^\[skill:([^\]]+)\]\n(?:Arguments: ([^\n]*)\n\n)?/
export const summarizePrompt = (line) => {
    const m = SKILL_PROMPT_RE.exec(line)
    if (!m) return line
    const [, name, args] = m
    return args ? `[skill:${name}] ${args}` : `[skill:${name}]`
}

// A single monotonically-growing WeakSet across a JSON.stringify replacer
// walk cannot distinguish "this object is an ancestor of the current node"
// (a real cycle) from "this object was already visited anywhere earlier in
// the tree" (a shared-but-acyclic reference, e.g. {a:sharedObj,b:sharedObj})
// -- it would falsely mark the second, legal reference as '[circular]' and
// silently drop real data. Correct cycle detection needs the ANCESTOR PATH
// only: push on entering a node, pop on leaving it, so a shared sibling
// reference (not on the current path) is never flagged.
function stringifyCircularSafe(value) {
    const path = []
    const walk = (v) => {
        if (v === null || typeof v !== 'object') return v
        if (path.includes(v)) return '[circular]'
        path.push(v)
        const out = Array.isArray(v) ? v.map(walk) : Object.fromEntries(Object.entries(v).map(([k, vv]) => [k, walk(vv)]))
        path.pop()
        return out
    }
    return JSON.stringify(walk(value), null, 2)
}

// Same result->text convention as the GUI's chat-transport.js applyChatEvents
// (String(content) for a string result, JSON.stringify otherwise) so a tool
// result reads consistently whichever surface renders it. A circular value
// (rare -- tool results are normally JSON-safe by the time they reach here)
// falls back to a circular-safe stringify rather than String(result)'s
// useless "[object Object]", so the actual structure is still visible.
export const resultToText = (result) => {
    if (result == null) return ''
    if (typeof result === 'string') return result
    try { return JSON.stringify(result, null, 2) } catch {
        try { return stringifyCircularSafe(result) } catch { return String(result) }
    }
}

// Builds the full set of render/notify helpers bound to one TUI instance's
// mutable state. Returned as a bag so app.js and the input-handling module
// can share the same closures without duplicating them.
export function createUiHelpers({ tui, minimap, status, skin, state }) {
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
            `session ${state.session ? state.session.slice(0, 8) : '…'}`,
            state.turnActive ? 'busy' : 'ready',
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

    // Ephemeral status line -- errors, resume markers, shell stdout/stderr,
    // console passthrough. There is no separate transcript Container to
    // append a Text node into (the minimap IS the whole view per the user's
    // explicit direction: "we ONLY want a minimap the minimap must fill the
    // screen"), so this routes straight into ContextMinimap's own bounded
    // notice queue.
    const note = (text, color = style.dim) => {
        minimap.pushNotice(text, color)
        render()
    }

    // Update-in-place variant for a repeating status line (chain retry/
    // fallback progress) -- overwrites the same logical notice instead of
    // appending a new one every call, so a long retry storm renders as one
    // line that changes instead of a scrolling wall of near-duplicates. No
    // default color (unlike note()): the one real caller (app.js's
    // chain-status passthrough) already builds `text` with its own inline
    // style.cyan/style.green/style.yellow segments baked in per
    // chain-log.js -- wrapping the whole already-styled string in a
    // default style.dim here (as an earlier version of this file did)
    // would apply an extra SGR attribute the original noteLive() (a bare
    // `new Text(text, ...)`, no wrapping at all) never applied.
    const noteLive = (key, text, { update = true, color = null } = {}) => {
        minimap.pushOrUpdateNotice(update ? key : Symbol(key), text, color)
        render()
    }
    // Removes a keyed live notice entirely (e.g. the ephemeral token-stream
    // line once its step settles into a real minimap row) -- distinct from
    // noteLive(key, '') , which would leave a permanent blank line in the
    // notices trailer forever after.
    const clearLive = (key) => {
        minimap.removeNotice(key)
        render()
    }

    // Approval prompt: an ephemeral notice plus y/n/a keys (input listener
    // consumes them while state.pendingApproval is set). Foreground
    // surface: a present human never gets auto-rejected (kimi 1.40
    // reversal) — runTurn gets approvalTimeoutMs: Infinity. Uses a stable
    // notice key ('approval') so the ack (answerApproval) updates this SAME
    // notice in place rather than appending a second line.
    const askApproval = (data) => {
        state.pendingApproval = data
        minimap.pushOrUpdateNotice('approval', `  [approval] ${data.name} ${summarizeArgs(data.args)} — [y]es / [n]o / [a]lways`, style.yellow)
        refresh()
    }
    const answerApproval = (a) => {
        const data = state.pendingApproval
        if (!data) return
        state.pendingApproval = null
        const approved = a !== 'n'
        minimap.pushOrUpdateNotice('approval', `  [approval ${a === 'a' ? 'always' : approved ? 'yes' : 'no'}] ${data.name}`, style.dim)
        resolveApproval(state.session, { id: data.id, approved, always: a === 'a', feedback: approved ? null : 'rejected in TUI' }).catch(() => {})
        refresh()
    }

    // ask_user_question channel: questions render as a notice and plain
    // submits are consumed as answers until all are resolved (the REPL
    // uses rl.question; here the editor is the input line).
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

    // Session-resume picker (--resume/-r/`/resume` with no explicit id):
    // renders one notice line per session row (fixed keys 'sessionpick-N' so
    // moveSessionPick's redraw updates each row in place via
    // pushOrUpdateNotice rather than appending N fresh lines per keypress),
    // plus a header line naming the interaction. Reuses the notice channel
    // rather than a new Container -- same pattern askApproval/showAskQuestion
    // already use for a modal-ish prompt inside the one scrolling view.
    const renderSessionPicker = () => {
        const picker = state.pendingSessionPick.picker
        const lines = picker.render(9999) // width clipping happens per-notice-line at real render time via truncateToWidth inside render(); 9999 here just avoids a premature clip before that
        // Fixed line count per render (session-picker.js's WINDOW +
        // header) -- tracked here rather than re-derived from
        // picker.rows.length, which no longer equals the rendered line
        // count once the list is windowed/scrolled.
        state.pendingSessionPick.lineCount = lines.length
        lines.forEach((line, i) => minimap.pushOrUpdateNotice(`sessionpick-${i}`, line, null))
        refresh()
    }
    const showSessionPicker = (picker) => {
        state.pendingSessionPick = { picker }
        renderSessionPicker()
    }
    const moveSessionPick = (delta) => {
        state.pendingSessionPick.picker.moveSelection(delta)
        renderSessionPicker()
    }
    const clearSessionPickerNotices = () => {
        const n = state.pendingSessionPick?.lineCount
        if (!n) return
        for (let i = 0; i < n; i++) minimap.removeNotice(`sessionpick-${i}`)
    }
    const confirmSessionPick = () => {
        const picker = state.pendingSessionPick?.picker
        if (!picker) return null
        const chosen = picker.selected
        clearSessionPickerNotices()
        state.pendingSessionPick = null
        refresh()
        return chosen
    }
    const cancelSessionPick = () => {
        clearSessionPickerNotices()
        state.pendingSessionPick = null
        note('resume cancelled', style.dim)
    }

    // The loader sits between the minimap and editor while a turn runs;
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
        markStarted, render, refresh, statusText, toast, note, noteLive, clearLive,
        askApproval, answerApproval, showAskQuestion, answerAsk, makeSetBusy,
        showSessionPicker, moveSessionPick, confirmSessionPick, cancelSessionPick,
    }
}

// Approval choice cursor for arrow/enter navigation (kimi's
// should_handle_running_prompt_key: up/down/enter/1-3 alongside y/n/a).
export const APPROVAL_CHOICES = ['y', 'n', 'a']
