export function toAssistantBlocks(content) {
  return content.map(toAssistantBlock)
}

export function toAssistantBlock(block) {
  switch (block.type) {
    case 'text': return { kind: 'text', text: block.text }
    case 'reasoning': return { kind: 'reasoning', text: block.text }
    case 'image': return { kind: 'image', attachment: block.attachment }
    case 'tool-call': return { kind: 'tool-call', callId: String(block.id), name: block.name, argsRaw: block.arguments }
    default: return { kind: 'other', block }
  }
}

const EMPTY_LIST = []
const EMPTY_TIMELINE = { turnOrder: EMPTY_LIST, turns: new Map() }

export const EMPTY_CONVERSATION_VIEWS = {
  get: () => undefined,
}

export const EMPTY_CHAT_SNAPSHOT = {
  order: EMPTY_LIST,
  nodes: {
    get: () => undefined,
    values: () => EMPTY_LIST,
  },
  locations: {
    getTurn: () => EMPTY_LIST,
    getStep: () => EMPTY_LIST,
  },
  timeline: EMPTY_TIMELINE,
  legacy: {
    nodes: EMPTY_LIST,
    turnTimings: new Map(),
    turnEnds: new Map(),
    partial: null,
    runningCalls: EMPTY_LIST,
  },
}
