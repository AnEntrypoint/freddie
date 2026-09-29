/** Immutable application of the image occurrences recorded by image/offload. */

import { OFFLOADED_IMAGE_TEXT } from '@freddie/freddie-llm'
import { deepFreeze } from '@freddie/freddie-values'

const OFFLOADED_BLOCK = { type: 'text', text: OFFLOADED_IMAGE_TEXT }

/**
 * Project selected image occurrences to immutable placeholder text.
 * @param message - message projected before this decision.
 * @param indexes - nonempty, strictly increasing depth-first image indexes.
 * @returns an immutable message with the same identity and selected images replaced.
 * @throws when a selected occurrence is missing.
 */
export function offloadMessageImages(message, indexes) {
  let imageIndex = 0
  let selected = 0
  const visit = (blocks) => {
    let next
    for (const [index, block] of blocks.entries()) {
      let projected = block
      if (block.type === 'image') {
        if (imageIndex === indexes[selected]) {
          projected = OFFLOADED_BLOCK
          selected += 1
        }
        imageIndex += 1
      } else if (block.type === 'tool-result') {
        const content = visit(block.content)
        if (content !== block.content) projected = { ...block, content }
      }
      if (projected !== block) next ??= blocks.slice(0, index)
      next?.push(projected)
    }
    return next ?? blocks
  }
  const content = visit(message.content)
  if (selected !== indexes.length) {
    throw new Error(`image/offload: image index ${indexes[selected]} does not exist`)
  }
  return deepFreeze({ ...message, content })
}
