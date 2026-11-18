
import { createHash } from '@freddie/freddie-runtime/crypto'

export function instructionContentSha1(content) {
  return createHash('sha1').update(content).digest('hex')
}

export function trimmedInstructionDigest(content) {
  return instructionContentSha1(content.trim())
}
