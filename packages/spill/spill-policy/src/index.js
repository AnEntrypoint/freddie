import z from '@freddie/schemastery'
import { TextRetainer, describeOmitted } from '@freddie/freddie-output-retention'

export const name = 'spill-policy'

export const inject = ['tools']

export const Config = z.object({
  maxInlineBytes: z.number(),
})

function flattenPlainText(content) {
  let text = ''
  for (const block of content) {
    if (block.type !== 'text') return undefined
    text += block.text
  }
  return text
}

function ownerSessionId(exec) {
  return exec.agent?.session.header.id
}

function preview(text, budget) {
  const headBytes = Math.ceil(budget / 2)
  const tailBytes = Math.floor(budget / 2)
  const retainer = new TextRetainer({ kind: 'headTail', headBytes, tailBytes })
  retainer.push(text)
  const kept = retainer.finish()
  return { text: kept.text, omitted: kept.omittedBytes }
}

function spillNotice(omitted, ref) {
  const omission = describeOmitted(omitted, 'bytes')
  return `(${omission} Full formatted result stored at: ${ref.locator}. ${ref.retrievalHint})`
}

export function apply(ctx, config) {
  const maxInlineBytes = config.maxInlineBytes
  if (maxInlineBytes === undefined) return
  if (!Number.isInteger(maxInlineBytes) || maxInlineBytes < 0) {
    throw new Error(`spill-policy: maxInlineBytes must be a non-negative integer (got ${maxInlineBytes})`)
  }
  const cap = maxInlineBytes

  async function spillReplacement(
    text,
    totalBytes,
    sessionId,
    toolName,
    callId,
    label,
  ) {
    if (sessionId === undefined) {
      ctx.logger.warn(`spill-policy: no session owner for ${toolName} ${label}; keeping the inline content`)
      return undefined
    }
    const spillStore = ctx.get('spillStore')
    if (!spillStore) {
      ctx.logger.warn('spill-policy: no ctx.spillStore backend loaded; keeping the inline content')
      return undefined
    }
    const save = {
      owner: { sessionId },
      source: { toolName, callId, label },
      suggestedName: `${toolName}.txt`,
      content: text,
    }
    let ref
    try {
      ref = await spillStore.saveText(save)
    } catch (error) {
      ctx.logger.warn(`spill-policy: saveText failed for ${toolName}: ${String(error)}; keeping the inline content`)
      return undefined
    }

    const reserve = Buffer.byteLength(spillNotice({ kind: 'exact', count: totalBytes }, ref), 'utf8') + 2
    const previewBudget = Math.max(0, cap - reserve)
    const { text: previewText, omitted } = preview(text, previewBudget)
    const notice = spillNotice(omitted, ref)
    const replacedText = previewText.length > 0 ? `${previewText}\n\n${notice}` : notice
    if (Buffer.byteLength(replacedText, 'utf8') > cap) {
      ctx.logger.warn(`spill-policy: spill notice for ${toolName} exceeds maxInlineBytes; keeping the inline content`)
      return undefined
    }
    return replacedText
  }

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (decision.kind !== 'accept' || Object.hasOwn(decision, 'value')
      || exec.parent !== undefined || exec.name === 'read') return decision

    const content = decision.content ?? result.content
    const text = flattenPlainText(content)
    if (text === undefined) return decision
    const totalBytes = Buffer.byteLength(text, 'utf8')
    if (totalBytes <= maxInlineBytes) return decision

    const replacedText = await spillReplacement(text, totalBytes, ownerSessionId(exec), exec.name, exec.callId, 'result')
    if (replacedText === undefined) return decision
    const replaced = [{ type: 'text', text: replacedText }]
    return { kind: 'accept', content: replaced, ...decision.additionalContexts ? { additionalContexts: decision.additionalContexts } : {} }
  }, { prepend: true })

  ctx.on('tools/code-dispatch-log', async (dispatch, next) => {
    const content = await next()
    const text = flattenPlainText(content)
    if (text === undefined) return content
    const totalBytes = Buffer.byteLength(text, 'utf8')
    if (totalBytes <= maxInlineBytes) return content

    const replacedText = await spillReplacement(
      text, totalBytes, ownerSessionId(dispatch.exec), dispatch.name, dispatch.subCallId, 'dispatch')
    if (replacedText === undefined) return content
    return [{ type: 'text', text: replacedText }]
  }, { prepend: true })
}
