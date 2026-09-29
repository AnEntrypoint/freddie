/**
 * The `turnOutline` projection unit: a pure fold of `turn/start` boundaries,
 * first human prompts, and final assistant responses into the whole-log turn
 * outline a history client renders for turns outside its paged event window.
 *
 * `turn/start` — not the prompt `user/message` — anchors every entry because
 * its seq is the load-through target for a jump: the agent loop logs
 * `turn/start` before the turn's prompt and steps, so a window paged back
 * through that seq contains the whole turn. Previews are space-joined text
 * blocks with collapsed whitespace and an ellipsis when clipped, budgeted to
 * one prompt line and up to three response lines, so a turn shows the same
 * words before and after its events load. The response commits at `turn/end`
 * from a draft of the newest text-bearing assistant message; draft-only
 * applies keep the `turns` array's identity, so the identity-gated change feed
 * pushes one frame per draft update, so a streaming turn emits several
 * value-identical frames before the response commits.
 *
 * @module @freddie/freddie-session-turn-outline/projection
 */

/** Prompt budget: one rail-card line. */
const PROMPT_PREVIEW_LIMIT = 50
/** Response budget: three rail-card lines. */
const RESPONSE_PREVIEW_LIMIT = 120

/**
 * Clip one text block to the scan budget.
 * @param block - one message content block.
 * @param budget - the maximum characters read from the block.
 * @returns the clipped text and whether the block continued past it.
 */
function clippedText(block, budget) {
  return block.text.length > budget
    ? { text: block.text.slice(0, budget), more: true }
    : { text: block.text, more: false }
}

/**
 * Space-join a message's text blocks into one single-line preview of at most
 * `limit` characters. Scanning stops at twice the limit: this fold runs on
 * every message event, so a multi-megabyte block is never concatenated — and
 * whitespace-normalized — whole for a preview this short.
 * @param content - the message's content blocks.
 * @param limit - the served preview budget.
 * @returns the preview; `''` when the message carries no text.
 */
function preview(content, limit) {
  const budget = limit * 2
  let joined = ''
  let more = false
  for (const block of content) {
    if (block.type !== 'text') continue
    if (joined.length >= budget) {
      more = true
      break
    }
    const clipped = clippedText(block, budget)
    joined += joined === '' ? clipped.text : ` ${clipped.text}`
    if (clipped.more) {
      more = true
      break
    }
  }
  const normalized = joined.replace(/\s+/g, ' ').trim()
  if (normalized.length > limit - 1) return `${normalized.slice(0, limit - 1).trimEnd()}…`
  return more ? `${normalized}…` : normalized
}

const EMPTY_OUTLINE = { turns: [], draft: '' }

/** The `turnOutline` unit registered on `ctx.sessionProjections`. */
export const turnOutlineProjectionDefinition = {
  key: 'turnOutline',
  stateVersion: 2,
  init: () => EMPTY_OUTLINE,
  apply: (state, event) => {
    switch (event.type) {
      case 'turn/start': {
        const last = state.turns.at(-1)
        const repeatsOrRewindsTurn = last !== undefined && event.data.turn <= last.turn
        if (repeatsOrRewindsTurn) return state
        return {
          turns: [...state.turns, { turn: event.data.turn, seq: event.seq, prompt: '', response: '' }],
          draft: '',
        }
      }
      case 'user/message': {
        if (event.data.source.kind !== 'user') return state
        const last = state.turns.at(-1)
        if (last === undefined) return state
        const openingPromptAlreadyCaptured = last.prompt !== ''
        if (openingPromptAlreadyCaptured) return state
        const prompt = preview(event.data.content, PROMPT_PREVIEW_LIMIT)
        if (prompt === '') return state
        return { turns: [...state.turns.slice(0, -1), { ...last, prompt }], draft: state.draft }
      }
      case 'assistant/message': {
        const draft = preview(event.data.message.content, RESPONSE_PREVIEW_LIMIT)
        if (draft === '' || draft === state.draft) return state
        return { turns: state.turns, draft }
      }
      case 'turn/end': {
        if (state.draft === '') return state
        const last = state.turns.at(-1)
        if (last === undefined || last.response === state.draft) return { turns: state.turns, draft: '' }
        return { turns: [...state.turns.slice(0, -1), { ...last, response: state.draft }], draft: '' }
      }
      default:
        return state
    }
  },
  wire: {
    view: state => state.turns,
  },
}
