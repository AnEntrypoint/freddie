const PACKAGE_NAME = '@freddie/freddie-llm'

export const name = 'llm-invariant'
export const inject = ['invariants']

function validateIndex(index, fail) {
  if (!Number.isSafeInteger(index) || index < 0) {
    fail(`LLM stream block index must be a non-negative safe integer, got ${index}`)
  }
}

function validateDelta(open, index, expected, fail) {
  validateIndex(index, fail)
  const actual = open.get(index)
  if (actual !== expected) {
    fail(`${expected} delta at index ${index} requires an open ${expected} block, got ${String(actual)}`)
  }
}

async function* validateStream(source, fail) {
  const open = new Map()
  let usageSeen = false
  let finished = false
  for await (const chunk of source) {
    if (finished) fail(`LLM stream emitted ${chunk.type} after terminal finish`)
    switch (chunk.type) {
      case 'block-start':
        validateIndex(chunk.index, fail)
        if (open.has(chunk.index)) fail(`LLM stream repeated block-start index ${chunk.index}`)
        open.set(chunk.index, chunk.blockType)
        break
      case 'text-delta':
        validateDelta(open, chunk.index, 'text', fail)
        break
      case 'reasoning-delta':
        validateDelta(open, chunk.index, 'reasoning', fail)
        break
      case 'tool-call-delta':
        validateDelta(open, chunk.index, 'tool-call', fail)
        break
      case 'block-end': {
        validateIndex(chunk.index, fail)
        const blockType = open.get(chunk.index)
        if (blockType === undefined) fail(`LLM stream block-end index ${chunk.index} has no open block`)
        if (chunk.block.type !== blockType) {
          fail(`LLM stream block-end index ${chunk.index} closes ${chunk.block.type}, expected ${blockType}`)
        }
        open.delete(chunk.index)
        break
      }
      case 'usage':
        if (usageSeen) fail('LLM stream emitted usage more than once')
        usageSeen = true
        break
      case 'finish':
        if (open.size > 0 && chunk.reason.kind !== 'error' && chunk.reason.kind !== 'aborted') {
          fail(`LLM stream finished with ${open.size} open block(s)`)
        }
        finished = true
        break
    }
    yield chunk
  }
  if (!finished) fail('LLM stream ended without a terminal finish chunk')
}

const install = (ctx, fail) => {
  ctx.on('llm/stream', (_options, next) => validateStream(next(), fail), { global: true, prepend: true })
  ctx.on('llm/adapters-updated', () => {
    const llm = ctx.get('llm')
    if (llm === undefined) return
    for (const provider of llm.listProviders()) {
      try {
        llm.providerRetryPolicy(provider.id)
      } catch {
        fail(`llm/adapters-updated fired while provider "${provider.id}" has no readable registration`)
      }
    }
  }, { global: true })
}

export const apply = ctx =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
