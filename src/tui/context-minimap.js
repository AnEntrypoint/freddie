// Full-width interactive context-window log: THE sole scrolling view in the
// TUI (no separate transcript Container) -- one row per MESSAGE (user,
// assistant, or tool), visually grouped into turns by a thin separator
// between consecutive turns. User and assistant rows always render their
// full content inline, unconditionally -- there is no fold for them, since
// that IS the transcript. Only a tool-call row folds: it shows a single
// collapsed summary line (name + token weight) by default, individually
// expandable via ctrl+o navigation (up/down selects a row, enter toggles
// that row's tool result open/closed, escape/ctrl+o again exits back to
// the editor). This is the ONLY place any turn output (tool results,
// assistant prose, user prompts) is shown once it scrolls past what's
// currently expanded. Ephemeral UI notices (errors, resume markers,
// console passthrough -- never real conversation content) render as their
// own plain lines below the row list via pushNotice/pushOrUpdateNotice.
//
// Token weight per message comes from src/agent/compress/tokens.js (the
// same pure estimator the real compaction pipeline uses server-side, so
// these numbers agree with what actually triggers compaction rather than a
// second, independently-drifting estimate).
import { truncateToWidth } from '@earendil-works/pi-tui'
import { estimateMessageTokens } from '../agent/compress/tokens.js'
import { COMPRESSION_THRESHOLD, HARD_COMPRESSION_THRESHOLD } from '../agent/compress/policy.js'
import { contextLengthForModel } from '../models/discovery.js'
import { resultToText, summarizePrompt } from './ui-helpers.js'
import { style } from './style.js'

// Ephemeral status-line cap (Ctrl-C notices, resume markers, shell-escape
// stdout/stderr, console.log/warn/error passthrough, approval acks) -- these
// are NOT conversation content: no token weight, never persisted, never
// sent to the LLM. Bounded the same way _explicitOrder/_openOrder are
// (oldest evicted first) so a long session's notice history doesn't grow
// unbounded; small because a notice is read once, in the moment, not
// browsed back to later the way a real turn's content is.
const MAX_NOTICES = 20

// Per-message-object memoization of estimateMessageTokens -- safe because
// every producer of these arrays (input-handlers.js's liveTurnMessages,
// state.messages assignment after a turn resolves) always pushes/assigns
// NEW message objects, never mutates an existing object's content in
// place, so a message object's weight is fixed for that object's whole
// lifetime. Without this, render() would re-run estimateMessageTokens over
// the ENTIRE message array on every single frame (many times/sec while
// streaming) just to build a cache-key string, even when nothing changed.
const _weightCache = new WeakMap()
function weightOf(message) {
    if (_weightCache.has(message)) return _weightCache.get(message)
    const w = estimateMessageTokens(message)
    _weightCache.set(message, w)
    return w
}

// Marks the index, within the flat messages array, of every turn boundary
// (a user-role message, or the very first message regardless of role) --
// used only to know where to draw the thin separator between turns; rows
// themselves are one per MESSAGE, never grouped/folded by turn. Returns a
// Set of indices that START a new turn.
//
// Assumes array order matches chronological order -- verified true for both
// producers: input-handlers.js only ever pushes fresh onto liveTurnMessages
// (never reorders), and src/sessions.js's getMessages (the /resume load
// path) queries `ORDER BY ts ASC, id ASC` directly against the database, so
// a resumed state.messages array is chronological on load, not grouped or
// reordered.
function turnStartIndices(messages) {
    const starts = new Set()
    messages.forEach((m, i) => { if (m.role === 'user' || i === 0) starts.add(i) })
    return starts
}

// Per-message open/closed state for tool rows ONLY -- keyed by a content
// signature (role + content length + a content prefix), NOT object
// identity. Object identity is unsafe here specifically because
// input-handlers.js's runPrompt swaps state.messages from the client's own
// live-accumulated liveTurnMessages objects to out.messages (the server's
// own, independently-constructed record) the instant a turn settles --
// live-verified as a real defect in an earlier version of this file:
// identity-keyed tracking silently lost every explicit open/close a user
// made during the turn, since the post-swap object for the same logical
// message is a DIFFERENT reference that was never in the map. A content
// signature survives that swap because the same logical message has the
// same role/content on both sides of it. Collision risk (two distinct tool
// calls sharing a signature) is accepted: the signature only decides a
// fold default/override, never which content renders -- a collision means
// two unrelated rows share a remembered open/closed choice, a cosmetic
// annoyance, not data loss. User/assistant messages never consult this --
// they are unconditionally always-open, no signature needed.
function messageSignature(message) {
    const { text } = contentTextFor(message)
    return message.role + ':' + text.length + ':' + text.slice(0, 40)
}
// A UI preference cache, not a durable store; a long session's oldest
// signatures aging out (reverting to the closed default) is an acceptable
// tradeoff against unbounded growth across a session that may run for
// days per this codebase's own long-horizon-task support.
const _SIGNATURE_CACHE_CAP = 200
const _openState = new Map()
const _explicitState = new Set()
const _explicitOrder = []
function rememberExplicit(sig, value) {
    if (!_explicitState.has(sig)) {
        _explicitOrder.push(sig)
        while (_explicitOrder.length > _SIGNATURE_CACHE_CAP) {
            const oldest = _explicitOrder.shift()
            _explicitState.delete(oldest)
            _openState.delete(oldest)
        }
    }
    _explicitState.add(sig)
    _openState.set(sig, value)
}
// Transcript rows (user/assistant) default OPEN -- a conversation reads as a
// transcript, not a wall of one-line previews -- while tool rows stay CLOSED
// by default because their raw results are verbose. An explicit ctrl+o toggle
// overrides per row and persists across renders/swaps via the content
// signature. Previously EVERY row defaulted closed (a uniform single-line
// preview); per direct user request the assistant rows are now folded open
// by default again, while tool rows keep their collapsed default.
function isMessageOpen(message) {
    const sig = messageSignature(message)
    if (_explicitState.has(sig)) return _openState.get(sig) === true
    // Default-open for user/assistant; tool rows default closed (verbose).
    return message.role !== 'tool'
}

// At most this many rows may be explicitly expanded at once -- opening a
// new one past the cap auto-closes the LONGEST-open one first. Without
// this, each open row is only capped at CONTENT_PREVIEW_LINES individually,
// but nothing bounded how many could be open SIMULTANEOUSLY -- up to
// MAX_VISIBLE_ROWS rows each showing up to CONTENT_PREVIEW_LINES could
// render ~350+ lines in one frame.
const MAX_OPEN_ROWS = 3
const _openOrder = []
function toggleMessageOpen(message) {
    const sig = messageSignature(message)
    const next = !isMessageOpen(message)
    rememberExplicit(sig, next)
    if (next) {
        _openOrder.push(sig)
        while (_openOrder.length > MAX_OPEN_ROWS) {
            const oldest = _openOrder.shift()
            _openState.set(oldest, false)
        }
    } else {
        const idx = _openOrder.indexOf(sig)
        if (idx !== -1) _openOrder.splice(idx, 1)
    }
}

// content-type label: tool rows carry the tool name (set by
// input-handlers.js's tool.end push); everything else is its role.
// message.name for a tool row ultimately traces back to a model-requested
// tool-call name (env.data.name on the wire, machine_builder.js), not a
// fixed literal freddie fully controls -- input-handlers.js also builds
// synthetic suffixed names like `${name} (denied)` from that same
// wire-sourced string. sanitizeForPreview strips any embedded ANSI/control
// bytes before this reaches a rendered line, same corruption risk as raw
// tool result content.
function labelFor(message) {
    if (message.role === 'tool') return message.name ? `tool:${sanitizeForPreview(message.name)}` : 'tool'
    return message.role || 'assistant'
}

// A tool result's on-wire shape is a JSON-stringified plain object (every
// handler dispatch returns {content: JSON.stringify(...)}, per
// machine_builder.js's real emitTurnEvent('tool.end', {result: ret.content,
// ...}) call) -- showing that raw envelope verbatim (e.g.
// '{"exitCode":0,"stdout":"...","stderr":""}') reads as noise, not signal:
// the human wants to see what actually happened (the command that ran, and
// its real output), not the wire encoding. Recognizes the common
// {stdout, stderr, exitCode} shape (bash and any other tool returning the
// same envelope) and formats it as the invoked command (from the paired
// tool.start args this message carries, see input-handlers.js's
// pendingToolArgs) plus stdout, stderr appended only if non-empty, exit
// code only noted if non-zero (the common case is 0 and not worth a line).
// Any OTHER JSON shape, or non-JSON content, falls through to the raw text
// unchanged -- this is a targeted recognition of one common envelope
// shape, not a general-purpose "prettify all tool results" pass.
// {stdout, stderr, exitCode} -- bash and any other tool sharing that shell
// envelope shape.
function formatShellEnvelope(parsed, message) {
    if (typeof parsed.stdout !== 'string') return null
    const lines = []
    const command = message.args?.command
    if (command) lines.push(command)
    if (parsed.stdout.trim()) lines.push(parsed.stdout.trimEnd())
    if (parsed.stderr && parsed.stderr.trim()) lines.push(parsed.stderr.trimEnd())
    if (parsed.exitCode != null && parsed.exitCode !== 0) lines.push(`[exit ${parsed.exitCode}]`)
    return lines.join('\n') || null
}

// {files: [...]} -- Glob/file_operations listing shape: one path per line
// instead of a JSON array literal.
function formatFilesEnvelope(parsed) {
    if (!Array.isArray(parsed.files)) return null
    if (!parsed.files.length) return '(no files)'
    return parsed.files.map(f => (typeof f === 'string' ? f : JSON.stringify(f))).join('\n')
}

// {skills: [{name, description, file}]} -- skill_manager's `list` action:
// one "name — description" line per skill instead of a JSON array of
// objects.
function formatSkillsEnvelope(parsed) {
    if (!Array.isArray(parsed.skills)) return null
    if (!parsed.skills.length) return '(no skills)'
    return parsed.skills.map(s => {
        if (!s || typeof s !== 'object') return String(s)
        return s.description ? `${s.name} — ${s.description}` : String(s.name)
    }).join('\n')
}

// {skill: {name, description, file, ...}} -- skill_manager's `get` action:
// a single skill record, rendered as name/description/file lines instead of
// a nested JSON object.
function formatSkillEnvelope(parsed) {
    if (!parsed.skill || typeof parsed.skill !== 'object') return null
    const s = parsed.skill
    const lines = []
    if (s.name) lines.push(s.name)
    if (s.description) lines.push(s.description)
    if (s.file) lines.push(s.file)
    return lines.join('\n') || null
}

// {message: {role, content}} -- skill_manager's `invoke` action wraps the
// resolved skill body as a chat message envelope; surface just its content,
// not the {role:"user",content:"..."} JSON wrapper.
function formatMessageEnvelope(parsed) {
    if (!parsed.message || typeof parsed.message !== 'object') return null
    return typeof parsed.message.content === 'string' ? parsed.message.content : null
}

// {matches: [...]} -- Grep result shape: one match per line, preferring a
// human path:line:text rendering when the entries carry that structure.
function formatMatchesEnvelope(parsed) {
    if (!Array.isArray(parsed.matches)) return null
    if (!parsed.matches.length) return '(no matches)'
    return parsed.matches.map(m => {
        if (typeof m === 'string') return m
        if (m && typeof m === 'object') {
            const loc = [m.path, m.line].filter(v => v != null).join(':')
            const text = typeof m.text === 'string' ? m.text : typeof m.content === 'string' ? m.content : ''
            return loc ? `${loc}${text ? ': ' + text : ''}` : JSON.stringify(m)
        }
        return String(m)
    }).join('\n')
}

// {error: "..."} on an otherwise-empty/failed result -- surfaces the actual
// error string instead of the JSON envelope it's wrapped in.
function formatErrorEnvelope(parsed) {
    if (typeof parsed.error !== 'string' || !parsed.error) return null
    const rest = Object.keys(parsed).filter(k => k !== 'error' && k !== 'ok')
    if (rest.length) return null // has other real content -- let generic prettify below handle it
    return `error: ${parsed.error}`
}

// {path, total, content} -- the `read` tool's exact shape (plugins/tools/
// files/lib/read.js): the already-line-numbered file content, unwrapped
// from its JSON envelope, with the source path/line-count as a header line
// instead of raw stdout the way formatShellEnvelope prints a command.
function formatReadEnvelope(parsed) {
    if (typeof parsed.content !== 'string' || typeof parsed.path !== 'string') return null
    const header = parsed.total != null ? `${parsed.path} (${parsed.total} lines)` : parsed.path
    return `${header}\n${parsed.content}`
}

// {path, bytes} -- the `write` tool's exact shape (plugins/tools/files/lib/
// write.js): confirms what was written and how much, instead of a bare
// two-field JSON object.
function formatWriteEnvelope(parsed) {
    if (typeof parsed.path !== 'string' || typeof parsed.bytes !== 'number') return null
    const rest = Object.keys(parsed).filter(k => k !== 'path' && k !== 'bytes')
    if (rest.length) return null
    return `wrote ${parsed.bytes} bytes -> ${parsed.path}`
}

// {content: "..."} -- other tools that wrap a single text payload with no
// other real fields; unwraps the envelope down to the real string instead
// of the JSON quoting. Checked AFTER formatReadEnvelope so read's own
// {path, total, content} shape (extra real fields) is never swallowed here
// with those fields silently dropped.
function formatContentEnvelope(parsed) {
    if (typeof parsed.content !== 'string') return null
    const rest = Object.keys(parsed).filter(k => k !== 'content')
    if (rest.length) return null
    return parsed.content
}

// Last-resort fallback for any other JSON object/array shape: pretty-printed
// (2-space indent) instead of the raw single-line JSON.stringify blob a tool
// handler actually returns on the wire -- still JSON, but readable, rather
// than a wall of {"a":1,"b":[...]} noise.
function prettyPrintFallback(parsed) {
    try { return JSON.stringify(parsed, null, 2) } catch { return null }
}

const ENVELOPE_FORMATTERS = [formatShellEnvelope, formatReadEnvelope, formatWriteEnvelope, formatFilesEnvelope, formatSkillsEnvelope, formatSkillEnvelope, formatMessageEnvelope, formatMatchesEnvelope, formatErrorEnvelope, formatContentEnvelope]

function formatToolContent(message) {
    if (typeof message.content !== 'string') return null
    let parsed
    try { parsed = JSON.parse(message.content) } catch { return null }
    if (!parsed || typeof parsed !== 'object') return null
    for (const formatter of ENVELOPE_FORMATTERS) {
        const out = formatter(parsed, message)
        if (out != null) return out
    }
    // Only fall back to pretty-printing a non-trivial object -- a bare
    // {ok:true} or similarly tiny envelope reads fine as raw text and isn't
    // worth the extra vertical lines a multi-line pretty-print would add.
    if (Object.keys(parsed).length > 1 || Array.isArray(parsed)) return prettyPrintFallback(parsed)
    return null
}

// Strips ANSI escape sequences (a bash command's stdout routinely carries
// real ones -- colored ls/git output, progress bars) and other non-
// printable control bytes (null, etc.) before a string reaches ANY
// rendered line -- left unsanitized, an escape sequence embedded mid-line
// can repaint color/cursor state for everything rendered AFTER it in the
// same terminal frame, corrupting the whole minimap's display, not just
// one row. Applied at BOTH the closed-row single-line preview and the
// open-row multi-line content view (adversarial review confirmed the
// earlier version's asymmetry -- sanitizing only the closed preview -- was
// a real gap: an opened row is not the last thing rendered in the frame
// either, so its raw content is exactly as capable of corrupting
// everything below it).
// eslint-disable-next-line no-control-regex -- deliberately matching C0
// control bytes (\x00-\x1F) minus \t/\n/\r (stripped separately by the
// caller's own whitespace collapse) plus \x7F, the actual sanitization
// target.
const ANSI_OR_CONTROL_RE = /\x1b\[[0-9;]*[a-zA-Z]|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g
export function sanitizeForPreview(text) {
    return text.replace(ANSI_OR_CONTROL_RE, '')
}

// An assistant message with tool_calls and no prose content (the model made a
// tool call with nothing to say) is the majority real-world shape -- a live
// wire-log audit of an actual session found 94 of 122 assistant message.append
// events were exactly this, all carrying real tool_calls. Left as '', this row
// renders as a genuinely blank preview line with no indication anything
// happened -- summarizing the call(s) instead ("bash({command:...})") gives
// the reader something to read even before the matching tool:name row lands.
function summarizeToolCalls(toolCalls) {
    return toolCalls.map((tc) => {
        const name = tc.function?.name || tc.name || '(unnamed)'
        const rawArgs = tc.function?.arguments ?? tc.arguments
        let argsText = typeof rawArgs === 'string' ? rawArgs : (() => { try { return JSON.stringify(rawArgs) } catch { return '' } })()
        if (argsText && argsText.length > 80) argsText = argsText.slice(0, 77) + '...'
        return argsText ? `${name}(${argsText})` : `${name}()`
    }).join(', ')
}

function rawTextFor(message) {
    const formatted = message.role === 'tool' ? formatToolContent(message) : null
    if (formatted != null) return formatted
    if (typeof message.content === 'string') {
        if (message.content.trim()) return message.content
        if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length) {
            return `[tool call] ${summarizeToolCalls(message.tool_calls)}`
        }
        return message.content
    }
    return resultToText(message.content)
}

// A /skill (or /gm) invocation's user-role message content is the fully-
// expanded skill body (see ui-helpers.js's summarizePrompt comment for the
// exact shape) -- the same reason that content gets collapsed to a short
// label in the transcript echo applies here too: opening this row is a
// human deciding to read what "the user" said, and the real answer is "ran
// a skill with these arguments," not hundreds of lines of the skill's own
// internal instructions. Only user-role messages are checked (an
// assistant/tool message's content never carries this prefix shape).
// Single source of truth for both "what text to show" and "was it
// collapsed" -- the render loop needs the latter to explain a row's
// token-weight/preview mismatch, and computing it a second time via its
// own copy of this same raw/role branching (as an earlier version of this
// function's caller did) is exactly the kind of duplicated logic that
// silently desyncs the moment one copy changes and the other doesn't.
function contentTextFor(message) {
    const raw = rawTextFor(message)
    const text = message.role === 'user' ? summarizePrompt(raw) : raw
    return { text, collapsed: text !== raw }
}

const ROLE_COLOR = {
    user: style.cyan,
    assistant: style.dim,
    tool: style.yellow,
    system: style.gray,
}

function colorFor(message) {
    return ROLE_COLOR[message.role] || style.dim
}

// Resolves and caches the ACTIVE model's real context window (async, one
// network-capable lookup per distinct model string) so the percentage
// shown is against the model's real ceiling, never a fixed floor constant
// that has no relationship to any real model's window (a prior version of
// this file divided by such a floor and produced readings like
// "89270/8000 -- 1116%" for any real conversation). Returns null (never
// throws, never guesses) until a real figure resolves or the model is
// unresolvable -- the caller renders an honest "window unknown" state
// rather than dividing by the wrong number.
const _contextLengthCache = new Map()
async function resolveContextLength(modelString) {
    if (!modelString) return null
    if (_contextLengthCache.has(modelString)) return _contextLengthCache.get(modelString)
    const len = await contextLengthForModel(modelString).catch(() => null)
    _contextLengthCache.set(modelString, len)
    return len
}

const CONTENT_PREVIEW_LINES = 30

export class ContextMinimap {
    #getMessages
    #getModel
    #getTurnActive
    #getRealUsage
    #getUsageTotals
    #cache = null
    #cacheKey = null
    #contextLength = null
    #resolvedForModel = null
    #onRefresh
    #selectedIndex = 0
    #userHasNavigated = false
    #navActive = false
    #notices = []
    #noticeSeq = 0

    // `onRefresh` (optional) fires once the async model-context-length
    // lookup resolves, so the caller can force an immediate repaint (e.g.
    // ui.refresh) instead of waiting for the next unrelated render tick to
    // pick up the corrected percentage denominator. `getTurnActive` is
    // accepted for constructor-signature compatibility with existing
    // callers but no longer drives any default-open behavior here (every
    // user/assistant row is unconditionally open regardless of turn
    // state; only tool rows fold, and they default closed always).
    // `getRealUsage` (optional) returns the EXACT token count of the last
    // real request this session actually sent to the LLM (machine_builder.js
    // emits this as a status.update/context_usage wire event right before its
    // own llm() call, post-decay/post-compress) -- preferred over summing
    // estimateMessageTokens across getMessages()'s own held array whenever
    // present, since that client-side sum drifts from reality the instant
    // server-side decay/compress shrinks the transcript but the client hasn't
    // yet received the updated context.messages back (a real session was
    // witnessed reading 2185043/500000 -- 437% -- purely from this drift,
    // client-side state.messages holding far more raw content than the
    // decayed/compressed payload actually sent on the wire).
    // `getUsageTotals` (optional) returns {input, output, cacheHit} session-
    // lifetime cumulative token counts (machine_builder.js's noteUsage) --
    // real provider usage.{prompt_tokens,completion_tokens} preferred,
    // freddie's own estimate as fallback when a provider reports all-zero
    // (live-verified for the providers actually configurable here). Shown
    // alongside the per-call context line, not instead of it -- context
    // usage answers "how full is the window right now", usage totals answer
    // "how much has this whole session cost so far."
    constructor(getMessages, getModel, onRefresh, getTurnActive, getRealUsage, getUsageTotals) {
        this.#getMessages = getMessages
        this.#getModel = getModel || (() => '')
        this.#onRefresh = onRefresh
        this.#getTurnActive = getTurnActive || (() => false)
        this.#getRealUsage = getRealUsage || (() => null)
        this.#getUsageTotals = getUsageTotals || (() => null)
    }
    invalidate() { this.#cache = null; this.#cacheKey = null }

    // Ephemeral status line -- Ctrl-C acks, resume/queue markers, shell
    // stdout/stderr, console passthrough. Replaces ui-helpers.js's old
    // note()/addChild-into-transcript path now that there is no separate
    // transcript Container to append into; every user-facing surface is
    // this one full-width view. `color` is an optional style function
    // (style.red/style.yellow/...), applied the same way note()'s own
    // `color` param was.
    pushNotice(text, color) {
        this.#notices.push({ id: ++this.#noticeSeq, text, color })
        while (this.#notices.length > MAX_NOTICES) this.#notices.shift()
        this.invalidate()
    }
    // Update-in-place variant for a repeating status line (chain retry
    // progress) -- mirrors the old noteLive()'s key-based overwrite so a
    // retry storm still renders as one line that changes, not a scrolling
    // wall of near-duplicates. `key` identifies the logical notice across
    // calls; a fresh key (or none matching) appends a new one.
    pushOrUpdateNotice(key, text, color) {
        const existing = this.#notices.find((n) => n.key === key)
        if (existing) { existing.text = text; existing.color = color; this.invalidate(); return }
        this.#notices.push({ id: ++this.#noticeSeq, key, text, color })
        while (this.#notices.length > MAX_NOTICES) this.#notices.shift()
        this.invalidate()
    }
    // Removes a keyed notice entirely (e.g. the live token-stream line once
    // its step has settled into a real minimap row) -- pushOrUpdateNotice
    // has no equivalent "clear" primitive, only overwrite, so setting text
    // to '' would leave a permanent blank line in the notices trailer
    // forever after (every subsequent render's notices loop still pushes
    // that empty string as its own line). A no-op if the key isn't
    // currently present (already cleared, or never existed).
    removeNotice(key) {
        const idx = this.#notices.findIndex((n) => n.key === key)
        if (idx === -1) return
        this.#notices.splice(idx, 1)
        this.invalidate()
    }

    get navActive() { return this.#navActive }
    // Entering nav mode (active:true) before the user has EVER explicitly
    // navigated (#userHasNavigated tracks this directly, not inferred from
    // #selectedIndex's value) seeds the selection to the LAST row instead
    // of leaving it at its unused default of 0 -- while not in nav mode
    // the view is always tailing the latest activity (see render()'s start
    // calculation), so jumping the selection straight to row 0 on first
    // ctrl+o would yank the view away from what the user was just looking
    // at, back to the very first message of the whole session.
    //
    // A dedicated flag (not "#selectedIndex === 0") is required here: 0 is
    // also a completely ordinary, REACHABLE position via normal navigation
    // (moveSelection's modular wraparound lands back on 0 after navigating
    // down through every row, and up-arrow from row 0 wraps to n-1 then
    // back). Adversarial review confirmed the index-based check was a real
    // defect: a user who deliberately navigates to row 0, exits nav mode
    // (escape/ctrl+o never reset #selectedIndex -- confirmed via raw-keys.js,
    // no call site does), then re-enters nav mode had their explicit choice
    // silently discarded and replaced with the tail. Tracking "has the user
    // ever actually pressed up/down/enter" directly, instead of guessing
    // from a value that has more than one legitimate meaning, removes the
    // ambiguity entirely -- once #userHasNavigated is true, every position
    // (including 0) is honored verbatim on every subsequent nav-mode entry.
    setNavActive(active) {
        if (active && !this.#userHasNavigated) {
            const n = this.#rowCount()
            if (n > 0) this.#selectedIndex = n - 1
        }
        this.#navActive = active
        this.invalidate()
    }
    // Row count (messages, not turns) as of the last render() call --
    // navigation clamps against this so up/down can't select past what's
    // actually on screen.
    #rowCount() { return (this.#getMessages() || []).length }
    // Both callers clamp #selectedIndex against the CURRENT row count
    // themselves rather than relying on render()'s own clamp -- a keypress
    // landing between a turn reset (state.liveTurnMessages shrinking back
    // to a single entry) and the next render() would otherwise read a
    // stale index and silently no-op (toggleSelected) or wrap unexpectedly
    // (moveSelection), acting on the wrong row -- or no row at all -- with
    // no visible sign the selection had drifted.
    #clampSelection(n) {
        if (!n) { this.#selectedIndex = 0; return }
        if (this.#selectedIndex >= n) this.#selectedIndex = n - 1
    }
    moveSelection(delta) {
        const n = this.#rowCount()
        if (!n) return
        this.#userHasNavigated = true
        this.#clampSelection(n)
        this.#selectedIndex = ((this.#selectedIndex + delta) % n + n) % n
        this.invalidate()
    }
    // Every row (user, assistant, tool) is uniformly foldable now -- there
    // is no role-based early-return in toggleMessageOpen, so this toggles
    // the selected row's open state regardless of role.
    toggleSelected() {
        const messages = this.#getMessages() || []
        this.#clampSelection(messages.length)
        const m = messages[this.#selectedIndex]
        if (!m) return
        toggleMessageOpen(m)
        this.invalidate()
    }

    // Fires once per distinct model string (fire-and-forget, cache-backed);
    // render() keeps showing the "window unknown" state until this
    // resolves, then the next render() picks up the corrected denominator.
    #ensureContextLength() {
        const model = this.#getModel()
        if (!model || model === this.#resolvedForModel) return
        this.#resolvedForModel = model
        resolveContextLength(model).then((len) => {
            // Guard against a stale, out-of-order response: if the user
            // switched models again before this particular lookup settled,
            // #resolvedForModel now names a DIFFERENT (newer) request --
            // applying this one would overwrite a more-recent/correct
            // value with data for a model that's no longer selected.
            if (this.#resolvedForModel !== model) return
            if (len && len !== this.#contextLength) {
                this.#contextLength = len
                this.invalidate()
                this.#onRefresh?.()
            }
        })
    }

    render(width) {
        if (width < 4) return []
        this.#ensureContextLength()
        const messages = this.#getMessages() || []
        if (this.#selectedIndex >= messages.length) this.#selectedIndex = Math.max(0, messages.length - 1)
        const weights = messages.map(weightOf)
        const starts = turnStartIndices(messages)
        // Open-row state and selection are read fresh into the cache key
        // (not just weights) since toggling a tool row or moving selection
        // must invalidate the cached render even though no message
        // changed. roleSig catches a message-object swap that changes role
        // at the same array index without changing total weight (the same
        // class of staleness an earlier per-turn version of this cache key
        // was adversarially found to miss).
        const roleSig = messages.map((m) => m.role).join(',')
        const openSig = messages.map((m) => isMessageOpen(m) ? '1' : '0').join('')
        const noticeSig = this.#notices.map((n) => n.id + ':' + n.text.length).join(',')
        const totalWeight = weights.reduce((sum, w) => sum + w, 0)
        const realUsage = this.#getRealUsage()
        const usageTotals = this.#getUsageTotals()
        const usageSig = usageTotals ? `${usageTotals.input}:${usageTotals.output}:${usageTotals.cacheHit}` : ''
        const cacheKey = width + ':' + this.#contextLength + ':' + totalWeight + ':' + realUsage + ':' + usageSig + ':' + weights.join(',') + ':' + roleSig + ':' + openSig + ':' + this.#selectedIndex + ':' + this.#navActive + ':' + noticeSig
        if (this.#cache && this.#cacheKey === cacheKey) return this.#cache

        // Prefer the real, exact wire-request size over the client-side
        // estimate whenever one has actually been reported this session --
        // see the constructor comment above for why the estimate alone
        // drifts (a session was witnessed reading 437% purely from this).
        const used = realUsage != null ? realUsage : totalWeight
        const denom = this.#contextLength
        const pct = denom ? Math.round((used / denom) * 100) : null
        const pctColor = pct == null ? style.dim : pct >= HARD_COMPRESSION_THRESHOLD * 100 ? style.red : pct >= COMPRESSION_THRESHOLD * 100 ? style.yellow : style.green
        const usedLabel = denom ? `${used}/${denom}` : `${used} tok`
        const pctLabel = pct == null ? '' : ' ' + pctColor(`${pct}%`)
        // Session-lifetime running totals, shown alongside the per-call
        // context line -- "how much has this whole session cost" is a
        // different question from "how full is the window right now", and
        // both are useful without one crowding out the other in one number.
        const usageLabel = usageTotals
            ? style.dim(`  total ${usageTotals.input + usageTotals.output} (in ${usageTotals.input}${usageTotals.cacheHit ? `, cache ${usageTotals.cacheHit}` : ''} / out ${usageTotals.output})`)
            : ''

        const lines = []
        lines.push(this.#navActive ? style.yellow('[nav: up/down select, enter open, esc exit]') : style.dim('(ctrl+o to browse)'))

        if (!messages.length) {
            lines.push(style.dim('(no messages yet)'))
        } else {
            // No windowing -- every row renders every time, every render.
            // A prior version sliced this to a small MAX_VISIBLE_ROWS
            // window (tailing while not in ctrl+o nav mode, centered on
            // the selection while browsing) specifically so a long session
            // didn't force the whole log on screen at once; per direct
            // user request ("same minimap without the cutoff... show all
            // rows not just the last ~12"), that tradeoff is reversed here
            // -- the terminal's own scrollback is now the mechanism for
            // seeing history, not an internal slice. pi-tui's
            // TuiMainScreen (what app.js actually renders through) is a
            // real scrollback-preserving renderer, not a fixed viewport
            // (per this repo's own AGENTS.md), so a long lines[] array is
            // exactly what that renderer is for.
            const start = 0
            const end = messages.length
            for (let i = start; i < end; i++) {
                const m = messages[i]
                const w = weights[i]
                const color = colorFor(m)
                const numLabel = color(String(w).padStart(5))
                const typeLabel = color(truncateToWidth(labelFor(m), 20, ''))
                const isSelected = this.#navActive && i === this.#selectedIndex
                const cursor = isSelected ? style.yellow('> ') : '  '
                const open = isMessageOpen(m)
                const openMark = open ? style.dim('v') : style.dim('>')
                // No bar: a single line of cursor + open-mark + colored
                // label + weight + a truncated one-line content preview
                // (dim), the whole thing clipped to the terminal width by
                // truncateToWidth -- replaces the prior '#'.repeat(...) bar
                // visualization per direct user request ("this should be
                // one line, replace the bar with colored text and cut it
                // off where the text with the number and side instead of
                // hashes"). The preview is the message's own content with
                // newlines collapsed to spaces (a multi-line tool result or
                // prompt reads as one flowing line here, never a ragged
                // multi-line block) -- CONTENT_PREVIEW_LINES-worth of real
                // multi-line detail still lives in the OPEN state below,
                // this is only the closed-row summary.
                const { text: previewSource } = contentTextFor(m)
                const preview = style.dim(sanitizeForPreview(previewSource).replace(/\s+/g, ' ').trim())
                lines.push(truncateToWidth(cursor + openMark + ' ' + typeLabel + ' ' + numLabel + ' ' + preview, width, ''))
                if (open) {
                    const { text, collapsed } = contentTextFor(m)
                    const contentLines = text.split('\n').slice(0, CONTENT_PREVIEW_LINES)
                    // Same terminal-frame-corruption risk as the closed-row
                    // preview (an embedded ANSI cursor/color sequence in raw
                    // tool stdout repaints state for everything rendered
                    // AFTER it in this frame) applies here too -- an opened
                    // row is not the last thing on screen, other rows and
                    // UI chrome still render below it. sanitizeForPreview
                    // strips ANSI/control bytes only, never collapses
                    // newlines here (each real line stays its own line,
                    // unlike the closed-row single-line preview).
                    for (const cl of contentLines) lines.push(truncateToWidth('    ' + style.dim(sanitizeForPreview(cl)), width, ''))
                    const hidden = text.split('\n').length - contentLines.length
                    // Two independent facts, each optional, NEVER assumed
                    // mutually exclusive: summarizePrompt's output is
                    // single-line for the args half of its template
                    // ([^\n]* is newline-bounded by construction) but NOT
                    // provably so for the skill-name half ([^\]]+ permits
                    // an embedded \n) -- treating "collapsed implies
                    // hidden===0" as a hard guarantee was live-verified as
                    // wrong via adversarial review (a multi-line skill name
                    // would hit hidden>0 and silently drop the collapsed
                    // explanation under a strict if/else-if). Building one
                    // trailer that names whichever facts are true, instead
                    // of picking one exclusively, closes that gap
                    // regardless of how summarizePrompt's output happens to
                    // be shaped.
                    const notes = []
                    if (hidden > 0) notes.push(`${hidden} more lines`)
                    if (collapsed) notes.push(`${w} tok, collapsed`)
                    if (notes.length) lines.push(truncateToWidth('    ' + style.dim(`... ${notes.join('; ')}`), width, ''))
                }
                // A thin separator marks a TURN boundary, not every row --
                // it appears BEFORE the first row of a turn (i.e. after the
                // previous turn's last row), so consecutive rows within one
                // turn run together while distinct turns stay visually
                // separated, without a rule attached to every single tool
                // call. Never before the very first visible row (nothing to
                // separate it from within the window) and never emitted for
                // a message this window doesn't actually show.
                if (i + 1 < end && starts.has(i + 1)) lines.push(style.dim('  ' + '-'.repeat(Math.max(0, width - 2))))
            }
            // No scroll-position indicator anymore -- there is no window
            // left to name a position within (start is always 0, end is
            // always messages.length), so the "(x-y/total)" line this used
            // to show would be permanently dead/always-true-condition code.
        }

        // The context-usage line lives HERE, immediately above the
        // ephemeral notices (and so immediately above the live-stream
        // feed, itself the last/most-recent notice) rather than at the
        // very top of the minimap -- per direct user request, the number a
        // reader actually watches during a long-running turn belongs right
        // next to the thing it's tracking (the live output), not scrolled
        // away above potentially hundreds of row lines.
        lines.push(truncateToWidth(style.bold('context ') + style.dim(usedLabel) + pctLabel + usageLabel, width, ''))

        // Ephemeral notices render below the row list, oldest first --
        // matches where the old transcript's own note()/noteLive() calls
        // used to land relative to everything else (appended at the
        // bottom, most-recent last, right above the editor). A null color
        // (ui-helpers.js's noteLive default) means the text is already
        // ANSI-styled inline by its own caller (chain-log.js) -- applying
        // a fallback wrapper here would double-wrap it, so only wrap when
        // a real color function was actually given. The null-color case is
        // never sanitized (it's OUR OWN pre-built styling, trusted); a
        // real-color case (ui-helpers.js's note() defaults to style.dim,
        // e.g. `!<cmd>` shell-escape stdout/stderr passed through with no
        // explicit color) IS sanitized first -- that text is genuinely raw
        // external command output, the same corruption risk the row
        // preview/content sanitization targets, left unfixed here until
        // adversarial review found it.
        for (const n of this.#notices) {
            // A notice's text CAN legitimately contain embedded newlines
            // now (the live LLM-stream feed's rolling 3-line buffer,
            // input-handlers.js's 'assistant-stream' key) -- each real
            // line renders as its OWN separate output line, not squashed
            // onto one line or mis-clipped by truncateToWidth (which only
            // understands a single line's width, not embedded '\n'). Every
            // OTHER existing notice caller (chain-status, approval, shell-
            // escape passthrough) has never emitted a '\n' in practice, so
            // this is a strict superset of the prior single-line behavior
            // for them -- split('\n') on a string with no newline returns
            // a single-element array, identical to before. Color is
            // applied PER-LINE, after splitting the sanitized raw text,
            // not once to the whole joined string before splitting --
            // wrapping the whole multi-line string in one style.dim(...)
            // call places the ANSI start code only on the first line and
            // the end code only on the last, leaving every middle line
            // unstyled and the terminal's style state bleeding past this
            // notice into whatever renders next (live-verified: style.dim
            // on a 3-line string produces exactly one \x1b[2m...\x1b[22m
            // pair spanning all three, not three independently-styled
            // lines).
            const sanitized = sanitizeForPreview(n.text)
            for (const line of sanitized.split('\n')) lines.push(truncateToWidth(n.color ? n.color(line) : line, width, ''))
        }

        this.#cache = lines
        this.#cacheKey = cacheKey
        return this.#cache
    }
}
