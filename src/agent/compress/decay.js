import { estimateMessageTokens, CHARS_PER_TOKEN } from './tokens.js'
import { isSafeCut } from './blocks.js'

// Continuous housekeeping, not threshold-triggered compaction. Runs every
// turn, synchronously, no LLM call: tool-result content is aged by
// turn-distance from the CURRENT iteration and shrunk monotonically as it
// gets older, so total size stays roughly flat instead of climbing to the
// compress()/pruneOldToolResults threshold and dropping in one big jump.
// compress() (LLM summarization) and pruneOldToolResults (binary
// keep/placeholder, threshold-gated) remain the emergency fallback for when
// decay alone hasn't kept the transcript under budget -- this module is the
// steady-state policy that tries to make that fallback rare.

export const DECAY_FULL_TURNS = 6 // most recent N turns: untouched
export const DECAY_TRUNCATE_TURNS = 20 // next M turns: truncated to head+tail
export const DECAY_TRUNCATE_HEAD_CHARS = 800
export const DECAY_TRUNCATE_TAIL_CHARS = 400
export const DECAY_PLACEHOLDER = '[Tool output decayed with age -- content cleared to keep context flat]'

// Depth-based aging (per direct user request): a message's real staleness
// signal is how far back it sits in TOKEN terms from the current point, not
// how many turns ago it happened -- a single turn can carry 100K tokens of
// tool output just as easily as 100 turns can carry the same total spread
// thin. Content buried more than DECAY_DEPTH_TRUNCATE_TOKENS deep is
// unlikely to ever be re-referenced (the durable plan/summary already lives
// in the transcript's own head/system content, not in a stale tool dump),
// so it starts truncating at that depth regardless of turn count; past
// DECAY_DEPTH_PLACEHOLDER_TOKENS deep it collapses fully. This runs
// ALONGSIDE the turn-count tiers above (whichever tier is stricter for a
// given message wins) since depth and turn-count catch different failure
// shapes: turn-count catches "this specific exchange is old", depth catches
// "so much has piled up since this exchange that it's effectively buried"
// even if the turn itself was recent.
export const DECAY_DEPTH_TRUNCATE_TOKENS = 100000
export const DECAY_DEPTH_PLACEHOLDER_TOKENS = 250000

// Age-only decay (fullTurns/truncateTurns above) misses the actual failure
// mode a real session hit: a handful of turns each carrying a MASSIVE
// individual tool result (a huge file read, a large codesearch dump) blow
// the context budget while still within DECAY_FULL_TURNS of "now" -- turn
// COUNT stayed low, but total SIZE didn't, and age-only decay correctly
// leaves recent turns untouched regardless of size, so nothing shrank.
// DECAY_SIZE_TRIGGER_CHARS is a size-driven floor applied to EVERY tool
// result regardless of age: any single tool result over this size is
// truncated to head+tail immediately, even on the current turn. This is
// deliberately much larger than DECAY_TRUNCATE_HEAD_CHARS+TAIL_CHARS (the
// age-based truncation target) -- it exists to catch the outlier-sized
// single result, not to duplicate the normal aging tier.
export const DECAY_SIZE_TRIGGER_CHARS = 20000

// Tags each message with the turn index it belongs to: every assistant
// message with tool_calls starts a new turn; its tool results and the
// assistant message itself carry that same turn index. Messages before the
// first tool_calls-bearing assistant message (system/user preamble) get -1
// so they're never touched by decay (decay only ever acts on tool content).
function assignTurnIndices(messages) {
    const turns = new Array(messages.length).fill(-1)
    let turn = -1
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i]
        if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) turn++
        turns[i] = turn
    }
    return turns
}

// depths[i] = total tokens of every message AFTER index i (i.e. how deep
// message i sits below the current end of the transcript). Computed as a
// running suffix sum so this is one O(n) pass, not O(n^2) -- a message near
// the end has depth ~0, a message near the start has depth ~= total size.
function computeDepths(messages) {
    const depths = new Array(messages.length).fill(0)
    let running = 0
    for (let i = messages.length - 1; i >= 0; i--) {
        depths[i] = running
        running += estimateMessageTokens(messages[i])
    }
    return depths
}

const DECAY_MARKER = '\n...[decayed: '

function truncateContent(content) {
    if (typeof content !== 'string') return content
    if (content.includes(DECAY_MARKER)) return content // already decay-truncated: idempotent, never re-slice
    const maxChars = DECAY_TRUNCATE_HEAD_CHARS + DECAY_TRUNCATE_TAIL_CHARS + 40
    if (content.length <= maxChars) return content
    const head = content.slice(0, DECAY_TRUNCATE_HEAD_CHARS)
    const tail = content.slice(-DECAY_TRUNCATE_TAIL_CHARS)
    const droppedChars = content.length - head.length - tail.length
    return `${head}${DECAY_MARKER}${droppedChars} chars / ~${Math.ceil(droppedChars / CHARS_PER_TOKEN)} tokens omitted]...\n${tail}`
}

// decayToolResults: ages tool-result messages by turn-distance from the
// latest turn present in `messages`, AND independently caps any single
// oversized result regardless of age (see DECAY_SIZE_TRIGGER_CHARS above --
// this is what actually fires on a recent-but-huge tool result that
// turn-age alone would leave untouched). Never touches system/user/
// assistant content, tool_calls themselves, or a message already at/under
// its tier's target size (idempotent -- re-running on an already-decayed
// transcript is a no-op for messages that haven't aged/grown further).
// isSafeCut is never consulted here because decay only rewrites tool-result
// CONTENT in place, never removes or reorders messages -- pairing is
// preserved by construction.
export function decayToolResults(messages, { fullTurns = DECAY_FULL_TURNS, truncateTurns = DECAY_TRUNCATE_TURNS, sizeTriggerChars = DECAY_SIZE_TRIGGER_CHARS, depthTruncateTokens = DECAY_DEPTH_TRUNCATE_TOKENS, depthPlaceholderTokens = DECAY_DEPTH_PLACEHOLDER_TOKENS } = {}) {
    if (!Array.isArray(messages) || messages.length === 0) return messages
    const turns = assignTurnIndices(messages)
    const latestTurn = turns.reduce((max, t) => Math.max(max, t), -1)
    if (latestTurn < 0) return messages
    const depths = computeDepths(messages)
    let changed = false
    const next = messages.map((m, i) => {
        if (m.role !== 'tool') return m
        if (typeof m.content !== 'string') return m
        const age = latestTurn - turns[i]
        const depth = depths[i]
        // Two independent aging signals, whichever is stricter for THIS
        // message wins: turn-age catches "this exchange happened long ago";
        // token-depth catches "so much has piled up since this exchange
        // that it's effectively buried" even on a recent turn (a single
        // turn dispatching dozens of tool calls can bury its own early
        // results under 100K+ tokens of its OWN later siblings). Depth
        // alone, not combined with turn-age, is what actually fires for a
        // gm-style loop where every tool result technically shares "turn 0".
        const placeholderEligible = age >= fullTurns + truncateTurns || depth >= depthPlaceholderTokens
        const truncateEligible = placeholderEligible || age >= fullTurns || depth >= depthTruncateTokens
        if (!truncateEligible) {
            // Size-driven floor: fires at ANY age/depth -- an oversized
            // result never gets a free pass just because it's both recent
            // and shallow.
            if (m.content.length <= sizeTriggerChars) return m
            const truncated = truncateContent(m.content)
            if (truncated === m.content) return m
            changed = true
            return { ...m, content: truncated }
        }
        if (!placeholderEligible) {
            const truncated = truncateContent(m.content)
            if (truncated === m.content) return m
            changed = true
            return { ...m, content: truncated }
        }
        if (m.content === DECAY_PLACEHOLDER) return m
        changed = true
        return { ...m, content: DECAY_PLACEHOLDER }
    })
    return changed ? next : messages
}

export function estimateDecaySavings(messages, opts) {
    const before = messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0)
    const after = decayToolResults(messages, opts).reduce((sum, m) => sum + estimateMessageTokens(m), 0)
    return before - after
}

// A THIRD decay stage past truncate (tier 1) and placeholder-collapse (tier
// 2, decayToolResults' own DECAY_PLACEHOLDER): once a tool result has been
// placeholder-collapsed AND has aged/buried past an even deeper threshold
// than placeholder-eligibility itself, remove the message pair outright
// instead of leaving a permanent zero-information row. A placeholder row
// still costs a fixed ~15 tokens forever and, more importantly, still
// occupies a message SLOT -- decayToBudget/decayToolResults only ever
// shrink content in place, so message COUNT climbs without bound even once
// every tool result is fully collapsed.
//
// Removing a tool-result message alone is unsafe: most providers reject a
// transcript where an assistant message's tool_calls entry has no matching
// tool-role response (the exact hazard blocks.js's isSafeCut already guards
// against for compress()'s block-cut boundaries). This function instead
// removes the ENTRY from the assistant message's own tool_calls array
// alongside deleting its paired tool-result message, so the two always
// change together -- the assistant message survives (with one fewer
// tool_calls entry, or none at all, falling through to a plain assistant
// message per llm_resolver.js's toMsgs, which omits an empty tool_calls key
// entirely) but the removed pair leaves no orphaned reference behind.
export const DECAY_REMOVE_TURNS = DECAY_FULL_TURNS + DECAY_TRUNCATE_TURNS + 20 // deeper than placeholder-eligibility
export const DECAY_REMOVE_DEPTH_TOKENS = DECAY_DEPTH_PLACEHOLDER_TOKENS + 100000

export function removeFullyDecayedPairs(messages, { removeTurns = DECAY_REMOVE_TURNS, removeDepthTokens = DECAY_REMOVE_DEPTH_TOKENS } = {}) {
    if (!Array.isArray(messages) || messages.length === 0) return messages
    const turns = assignTurnIndices(messages)
    const latestTurn = turns.reduce((max, t) => Math.max(max, t), -1)
    if (latestTurn < 0) return messages
    const depths = computeDepths(messages)
    // Eligibility is scoped to (turnIndex, tool_call_id) PAIRS, never a bare
    // tool_call_id alone -- adversarial review (G_INDEP) found a real
    // cross-turn collision: llm_resolver.js's streaming adapter mints
    // synthetic ids as 'call_' + a per-response positional counter whenever
    // the provider event lacks a native toolCallId, so two DIFFERENT turns in
    // the same session can both produce a tool_call_id of 'call_0'. A global
    // Set<string> keyed on the bare id would then strip/delete a recent,
    // still-live pair in one turn because an unrelated OLD pair in another
    // turn happened to mint the identical synthetic id. Scoping the key to
    // the (turn, id) pair makes a same-id-different-turn collision inert --
    // each turn's own ids are only ever compared against messages from that
    // SAME turn.
    const removableKeys = new Set()
    messages.forEach((m, i) => {
        if (m.role !== 'tool' || typeof m.content !== 'string') return
        if (m.content !== DECAY_PLACEHOLDER) return
        const age = latestTurn - turns[i]
        if (age < removeTurns && depths[i] < removeDepthTokens) return
        if (m.tool_call_id) removableKeys.add(turns[i] + ':' + m.tool_call_id)
    })
    if (!removableKeys.size) return messages
    let changed = false
    const next = []
    for (let i = 0; i < messages.length; i++) {
        const m = messages[i]
        if (m.role === 'tool' && m.tool_call_id && removableKeys.has(turns[i] + ':' + m.tool_call_id)) {
            changed = true
            continue // drop the fully-decayed tool-result message
        }
        if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
            const turn = turns[i]
            const kept = m.tool_calls.filter(tc => !removableKeys.has(turn + ':' + tc.id))
            if (kept.length !== m.tool_calls.length) {
                changed = true
                // Falls through to a plain assistant message when kept.length
                // is 0 -- toMsgs (llm_resolver.js) already omits tool_calls
                // entirely for a falsy/empty array, so an explicit [] here is
                // never sent upstream as an empty tool_calls list.
                next.push(kept.length ? { ...m, tool_calls: kept } : { ...m, tool_calls: undefined })
                continue
            }
        }
        next.push(m)
    }
    return changed ? next : messages
}

// Live-witnessed gap in decayToolResults alone (real session: 556582/500000
// tokens, 111% over, with decay wired and running every turn): age/size-tier
// decay treats "within fullTurns of now" as an unconditional free pass no
// matter how much AGGREGATE volume those recent turns carry. A gm-style
// loop that dispatches dozens of small-to-medium tool calls (bash/read,
// each individually under DECAY_SIZE_TRIGGER_CHARS) PER TURN never trips
// either the age tier (they're all "recent") or the size tier (none of them
// individually huge) -- yet their sum still blew the budget. Per-message
// tiers alone cannot catch an aggregate problem; this function adds the
// missing budget-aware pass: after the normal tiered decay runs, if total
// size is STILL over `targetTokens`, keep shrinking the oldest still-full
// tool results (oldest first, working forward) past the fullTurns free-pass
// until back under budget or nothing shrinkable remains. This is still
// continuous per-turn housekeeping (no LLM call, synchronous, idempotent),
// not compress()'s threshold-triggered emergency summarization -- it just
// closes the gap age/size-alone left open.
export function decayToBudget(messages, targetTokens, opts = {}) {
    let next = decayToolResults(messages, opts)
    if (!(targetTokens > 0)) return next
    let total = next.reduce((sum, m) => sum + estimateMessageTokens(m), 0)
    if (total <= targetTokens) return next
    const depths = computeDepths(next)
    // Deepest-first order among tool-result indices still at full size (not
    // yet truncated/placeholdered by the tiered pass above) -- shrink the
    // ones buried furthest below the current end of the transcript before
    // touching anything shallower. Sorting by DEPTH rather than turn-index
    // matters specifically for the gm-loop failure shape this exists to
    // catch: dozens of tool calls sharing one turn index have no useful
    // turn-based ordering among themselves, but a real, distinct depth
    // ordering (each one's actual token-distance from "now").
    // depth === 0 means nothing in the transcript sits after this message --
    // it belongs to the CURRENT turn's own tool results. Hard-excluded here
    // regardless of remaining budget shortfall: the age/depth eligibility
    // check in decayToolResults is a SEPARATE code path (this loop runs after
    // it, on whatever it left untouched), so without this explicit floor an
    // extreme-budget-pressure run could still walk this sorted list all the
    // way down to depth-0 entries and decay tool output the model just
    // produced this turn.
    const shrinkable = next
        .map((m, i) => ({ i, depth: depths[i] }))
        .filter(({ i, depth }) => depth > 0 && next[i].role === 'tool' && typeof next[i].content === 'string' && next[i].content !== DECAY_PLACEHOLDER && !next[i].content.includes(DECAY_MARKER))
        .sort((a, b) => b.depth - a.depth)
    if (!shrinkable.length) return next
    const out = next.slice()
    for (const { i } of shrinkable) {
        if (total <= targetTokens) break
        const before = estimateMessageTokens(out[i])
        const truncated = truncateContent(out[i].content)
        if (truncated !== out[i].content) {
            out[i] = { ...out[i], content: truncated }
            total -= before - estimateMessageTokens(out[i])
            continue
        }
        // Already at (or under) the truncation target and still contributing
        // to an over-budget total -- collapse fully rather than leave it
        // untouched; there is nothing smaller than the placeholder.
        if (out[i].content !== DECAY_PLACEHOLDER) {
            out[i] = { ...out[i], content: DECAY_PLACEHOLDER }
            total -= before - estimateMessageTokens(out[i])
        }
    }
    return out
}
