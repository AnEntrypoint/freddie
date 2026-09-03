// Formats acptoapi's raw `[chain] ...` console.log lines into a compact,
// readable, live-updating status line instead of one dim entry per retry.
// Root cause of the readability complaint: chain-machine.js emits one
// console.log per attempt/fallback/skip, and app.js's console reroute
// (every subsystem writes via console, not a structured event) appended
// each one as its own permanent transcript line verbatim -- a multi-minute
// rate_limit/model_unhealthy retry storm rendered as dozens of near-
// identical "[chain] chat try ..." / "[chain] fallback reason=..." lines
// with no visual hierarchy and no indication anything was actually
// happening differently between them.

const REASON_LABELS = {
    rate_limit: 'rate limited',
    model_unhealthy: 'unhealthy (too many recent failures)',
    timeout: 'timed out',
    empty: 'empty response',
    auth: 'auth failed',
    fetch_failed: 'unreachable',
    content_policy: 'content policy',
    sampler_backoff: 'in backoff',
    matrix_block: 'blocked by matrix',
    error: 'error',
}

// chain-machine.js has two near-identical call paths (runChat -> "chat
// try"/"chat ok", runStream -> "stream try"/"stream ok") emitting the same
// shape under a different verb word. freddie's own llm_resolver.js only
// calls the non-streaming sdk.chat() today (AGENTS.md: "the llm_resolver
// path is non-streaming"), so the stream variant is currently unreachable
// from freddie's own turn loop -- but it's real, live acptoapi output any
// other in-tree consumer of chain()/streamChain() could still trigger
// (e.g. a future streaming caller), so both verbs are matched rather than
// silently dropping half of chain-machine.js's real log shape.
const CHAIN_PATTERNS = [
    { re: /^\[chain\] (?:chat|stream) try provider=(\S+) model=(\S+) attempt=(\d+)\/(\d+)$/, kind: 'try' },
    { re: /^\[chain\] (?:chat|stream) ok provider=(\S+) model=(\S+) ms=(\d+)$/, kind: 'ok' },
    { re: /^\[chain\] fallback reason=(\S+) from=(\S+)(?: to=(\S+)| \(exhausted\))?$/, kind: 'fallback' },
    { re: /^\[chain\] skip reason=(\S+) model=(\S+)(?: -> (\S+)| \(exhausted\))?$/, kind: 'skip' },
]

function parseChainLine(line) {
    for (const { re, kind } of CHAIN_PATTERNS) {
        const m = re.exec(line)
        if (!m) continue
        if (kind === 'try') return { kind, provider: m[1], model: m[2], attempt: +m[3], total: +m[4] }
        if (kind === 'ok') return { kind, provider: m[1], model: m[2], ms: +m[3] }
        if (kind === 'fallback') return { kind, reason: m[1], from: m[2], to: m[3] || null }
        if (kind === 'skip') return { kind, reason: m[1], model: m[2], to: m[3] || null }
    }
    return null
}

// Creates a stateful formatter: call feed(line) for every raw console line.
// Returns { text, color, update } when it recognizes a chain line AND wants
// it displayed (update:true means the caller should overwrite its last
// chain-status Text node instead of adding a new one); { suppress: true }
// when it recognizes a chain line but the line is normal-path noise not
// worth showing (see the try/ok branches below); or null when the line
// isn't a chain line at all (caller should fall back to its normal
// note()). suppress is a DISTINCT outcome from null: a caller that treats
// them the same would print the raw unformatted "[chain] chat try ..."
// string as a permanent line via its own null-means-unrecognized fallback,
// which is worse than the noise this was meant to remove.
//
// Only a genuine SIGNAL gets shown: a retry (same model, attempt>1), a
// fallback/skip (something failed and the chain is moving on), or the
// final settle of a call that already showed a retry/fallback -- so the
// user can see it actually resolved instead of the status line just
// vanishing mid-story. A normal, uneventful single-attempt success shows
// NOTHING: repeating "trying model-x" identically across several genuinely
// separate, independently-successful calls in one turn conveys no
// information (it always says the same thing regardless of real progress)
// -- this was reported directly as "not signal."
//
// Not session/turn-scoped: lastModel/hadSignal track ONE chain's progress
// across calls with no turn/session id in the mix. Correct today because a
// single TUI process (app.js's one console.log override, one formatter
// instance) only ever has one turn's chain machinery actively logging at a
// time -- freddie's turn loop doesn't run two LLM chains concurrently
// through the same console. If that ever changes (concurrent turns sharing
// this process's console output), two chains' model tracking would
// interleave and corrupt each other's displayed line. Not fixed here since
// it can't currently occur and the real fix (threading a turn id through
// acptoapi's own chain-machine.js logging) is out of this file's reach --
// noted so it isn't rediscovered as a surprise later.
export function createChainLogFormatter({ style }) {
    let lastModel = null
    let hadSignal = false

    return function feed(line) {
        const ev = parseChainLine(line)
        if (!ev) { lastModel = null; hadSignal = false; return null }

        if (ev.kind === 'try') {
            // attempt resets to 1 at the start of every fresh resolveCallLLM
            // invocation's inner loop through sdk.chat (llm_resolver.js's own
            // `for (let attempt = 0; ; attempt++)`), never on an in-place
            // chain-machine retry of the SAME call -- so attempt===1 is the
            // authoritative "this is a brand new logical LLM call" signal,
            // not "same model as last time I saw a try line". Keying the
            // retry label on acptoapi's own reported attempt number (rather
            // than a locally-accumulated counter that only ever reset on a
            // completed 'ok') is what stops the count compounding across
            // separate, independent calls that each individually succeed or
            // fail without ever emitting 'ok' for the model in question.
            const sameModel = ev.model === lastModel
            lastModel = ev.model
            // A same-model retry only happens via chain-machine's own
            // within-call FALLBACK->trying re-entry on the identical link
            // (rare -- most fallbacks move to a DIFFERENT link/model). A
            // higher attempt number for a DIFFERENT model means "this is
            // link N of the SAME chain walk that already fell back" --
            // still part of a story worth showing the ending of, distinct
            // from attempt===1, which is unambiguously the start of a
            // brand-new, unrelated logical call (llm_resolver.js's outer
            // loop always begins there) and is the only case that should
            // reset hadSignal. Keying the reset on attempt===1 rather than
            // "different model" fixes a real bug: a fallback firing (which
            // sets hadSignal=true) immediately followed by its own
            // attempt>1 try for the NEW model was wiping hadSignal back to
            // false before the eventual ok line could check it, silently
            // swallowing the settle line for a call that visibly retried.
            if (ev.attempt === 1) { hadSignal = false; return { suppress: true } }
            hadSignal = true
            const suffix = sameModel ? style.dim(` (retry ${ev.attempt})`) : ''
            return { text: `  ${style.dim('⋯')} trying ${style.cyan(ev.model)}${suffix}`, color: null, update: sameModel }
        }
        if (ev.kind === 'ok') {
            lastModel = null
            // Only show the settle line if this call's story already had a
            // visible retry/fallback -- otherwise the "trying" line was
            // itself suppressed above and an "ok" with nothing before it
            // reads as a random, disconnected success notice.
            const show = hadSignal
            hadSignal = false
            if (!show) return { suppress: true }
            return { text: `  ${style.green('✓')} ${style.cyan(ev.model)} responded in ${(ev.ms / 1000).toFixed(1)}s`, color: null, update: true }
        }
        if (ev.kind === 'fallback' || ev.kind === 'skip') {
            const label = REASON_LABELS[ev.reason] || ev.reason
            const model = ev.model || ev.from
            const next = ev.to ? `, moving to ${style.cyan(ev.to)}` : ', no more models to try'
            const sameModel = model === lastModel
            hadSignal = true
            return { text: `  ${style.yellow('⚠')} ${style.cyan(model)} ${label}${next}`, color: null, update: sameModel }
        }
        return null
    }
}
