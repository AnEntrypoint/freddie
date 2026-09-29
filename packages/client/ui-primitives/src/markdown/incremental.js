
const UNSTABLE_TAIL_BLOCKS = 2

function blockKey(node, base, index) {
  const offset = node.position?.start.offset
  return offset === undefined ? -(index + 1) : base + offset
}

export class IncrementalMarkdownParser {
  prevText = ''
  tailStart = 0
  frozen = []
  generation = 0
  cached = null

  constructor(parse) {
    this.parse = parse
  }

  update(text) {
    if (this.cached !== null && text === this.prevText) return this.cached
    const extendsPreviousText = text.startsWith(this.prevText)
    if (!extendsPreviousText) {
      this.prevText = ''
      this.tailStart = 0
      this.frozen = []
      this.generation += 1
    }
    this.prevText = text
    const base = this.tailStart
    const blocks = this.parse(text.slice(base)).children
    let firstUnstable = Math.max(0, blocks.length - UNSTABLE_TAIL_BLOCKS)
    if (firstUnstable > 0) {
      const cutEnd = blocks[firstUnstable - 1]?.position?.end.offset
      if (cutEnd === undefined) {
        firstUnstable = 0
      } else {
        for (const node of blocks.slice(0, firstUnstable)) {
          this.frozen.push({ node, key: blockKey(node, base, this.frozen.length) })
        }
        this.tailStart = base + cutEnd
      }
    }
    const tail = blocks.slice(firstUnstable).map((node, index) => ({
      node,
      key: blockKey(node, base, index),
    }))
    this.cached = { frozen: [...this.frozen], tail, generation: this.generation }
    return this.cached
  }
}
