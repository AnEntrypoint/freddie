
export function assistantText(blocks) {
  return blocks.flatMap(block => block.kind === 'text' ? [block.text] : []).join('')
}
