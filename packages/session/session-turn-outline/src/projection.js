const PROMPT_PREVIEW_LIMIT = 50
const RESPONSE_PREVIEW_LIMIT = 120

function clippedText(block, budget) {
  return block.text.length > budget
    ? { text: block.text.slice(0, budget), more: true }
    : { text: block.text, more: false }
}

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
