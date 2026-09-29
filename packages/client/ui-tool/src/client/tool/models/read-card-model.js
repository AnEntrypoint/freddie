import { abbreviateHomePath } from '@freddie/freddie-client-runtime/client'
import { relativizeToCwd } from './tool-call-model.js'

export const CHAT_READ_MAX_LINES = 8

export function readCardModel(block, sessionCwd, home) {
  if (!('kind' in block)) return null
  const result = block.resultView?.card === 'read' ? block.resultView : null
  if (result === null) return null
  const lines = result.lines.map(line => ({ number: line.number, text: line.text }))
  return {
    label: result.title ?? abbreviateHomePath(relativizeToCwd(result.path, sessionCwd), home),
    lines,
    totalLines: result.totalLines,
    lang: result.lang,
  }
}
