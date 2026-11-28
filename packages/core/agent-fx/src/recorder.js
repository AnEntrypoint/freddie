import { BlockAssembler, createAssistantMessage } from '@freddie/freddie-llm'

const FINISH_KINDS = { stop: 'stop', toolCalls: 'tool-calls', maxTokens: 'max-tokens' }

export class MessageRecorder {
  blocks = []
  unclaimed = []

  constructor(session, turn, step, source) {
    this.session = session
    this.turn = turn
    this.step = step
    this.source = source
  }

  text(kind, text) {
    const last = this.blocks.at(-1)
    if (last?.type === kind) last.text += text
    else this.blocks.push({ type: kind, text })
  }

  toolCall(id, name, input) {
    const block = { type: 'tool-call', id, name, arguments: JSON.stringify(input ?? {}) }
    this.blocks.push(block)
    this.unclaimed.push(block)
  }

  claim(executionId, name) {
    const at = this.unclaimed.findIndex(block => block.id === executionId)
    const index = at >= 0 ? at : this.unclaimed.findIndex(block => block.name === name)
    if (index < 0) throw new Error(`fx executed tool "${name}" (${executionId}) without a tool_start for it`)
    return this.unclaimed.splice(index, 1)[0]
  }

  flush(finishKind) {
    if (this.blocks.length === 0) return undefined
    const assembler = new BlockAssembler()
    const chunkSeqs = []
    const push = (chunk) => {
      chunkSeqs.push(this.session.append('assistant/chunk', { turn: this.turn, step: this.step, chunk }).seq)
      assembler.push(chunk)
    }
    this.blocks.forEach((block, index) => {
      push({ type: 'block-start', index, blockType: block.type })
      if (block.type === 'tool-call') push({ type: 'tool-call-delta', index, id: block.id, name: block.name, argumentsDelta: block.arguments })
      else push({ type: block.type === 'text' ? 'text-delta' : 'reasoning-delta', index, text: block.text })
    })
    push({ type: 'finish', reason: { kind: finishKind } })
    const message = createAssistantMessage({ content: assembler.blocks(), source: this.source })
    this.session.append('assistant/message', { turn: this.turn, step: this.step, message }, { surfaceOp: 'append', sourceEventSeqs: chunkSeqs })
    this.blocks = []
    return message
  }
}

export { FINISH_KINDS }
