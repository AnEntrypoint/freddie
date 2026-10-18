


function assertBudget(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`)
  }
}

export class ItemRetainer {
  maxItems
  items = []
  seen = 0
  omittedCount = 0

  constructor(strategy) {
    assertBudget(strategy.maxItems, 'maxItems')
    this.maxItems = strategy.maxItems
  }

  push(item) {
    this.seen++
    if (this.items.length < this.maxItems) {
      this.items.push(item)
      return { kept: true, truncated: false }
    }
    this.omittedCount++
    return {
      kept: false,
      truncated: true,
    }
  }

  finish() {
    const truncated = this.omittedCount > 0
    return {
      items: this.items,
      truncated,
      seen: this.seen,
      kept: this.items.length,
      omitted: truncated
        ? { kind: 'exact', count: this.omittedCount }
        : { kind: 'none' },
    }
  }
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function trimTrailingPartialUtf8(bytes) {
  let i = bytes.length - 1
  while (i >= 0 && (bytes[i] & 0xc0) === 0x80 && bytes.length - i <= 3) i--
  if (i < 0) return bytes
  const lead = bytes[i]
  const expected = lead < 0x80 ? 1 : lead < 0xe0 ? 2 : lead < 0xf0 ? 3 : lead < 0xf8 ? 4 : 0
  if (expected === 0) return bytes
  return bytes.length - i < expected ? bytes.subarray(0, i) : bytes
}

function trimLeadingContinuationUtf8(bytes) {
  let i = 0
  while (i < bytes.length && (bytes[i] & 0xc0) === 0x80) i++
  return bytes.subarray(i)
}

export class TextRetainer {
  prefixCap
  suffixCap
  prefixChunks = []
  prefixHeld = 0
  suffixChunks = []
  suffixHeld = 0
  total = 0

  constructor(strategy) {
    switch (strategy.kind) {
      case 'head':
        assertBudget(strategy.maxBytes, 'maxBytes')
        this.prefixCap = strategy.maxBytes
        this.suffixCap = 0
        break
      case 'tail':
        assertBudget(strategy.maxBytes, 'maxBytes')
        this.prefixCap = 0
        this.suffixCap = strategy.maxBytes
        break
      case 'headTail':
        assertBudget(strategy.headBytes, 'headBytes')
        assertBudget(strategy.tailBytes, 'tailBytes')
        this.prefixCap = strategy.headBytes
        this.suffixCap = strategy.tailBytes
        break
    }
  }

  push(chunk) {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk
    const before = this.total
    this.total += bytes.length

    const room = this.prefixCap - this.prefixHeld
    const take = Math.max(0, Math.min(room, bytes.length))
    if (take > 0) {
      this.prefixChunks.push(bytes.subarray(0, take))
      this.prefixHeld += take
    }

    if (this.suffixCap > 0) {
      this.suffixChunks.push(bytes)
      this.suffixHeld += bytes.length
      let head = this.suffixChunks[0]
      while (head !== undefined && this.suffixHeld - head.length >= this.suffixCap) {
        this.suffixChunks.shift()
        this.suffixHeld -= head.length
        head = this.suffixChunks[0]
      }
      if (head !== undefined && this.suffixHeld > this.suffixCap) {
        const excess = this.suffixHeld - this.suffixCap
        this.suffixChunks[0] = head.subarray(excess)
        this.suffixHeld -= excess
      }
    }

    const droppedThisChunk = this.omittedAt(this.total) > this.omittedAt(before)
    return {
      kept: !droppedThisChunk,
      truncated: this.omittedAt(this.total) > 0,
    }
  }

  omittedAt(total) {
    const prefixLen = Math.min(total, this.prefixCap)
    const suffixLen = Math.min(total - prefixLen, this.suffixCap)
    return total - prefixLen - suffixLen
  }

  finish() {
    const prefixLen = Math.min(this.total, this.prefixCap)
    const suffixLen = Math.min(this.total - prefixLen, this.suffixCap)

    const prefix = concat(this.prefixChunks)
    const suffix = concat(this.suffixChunks).subarray(this.suffixHeld - suffixLen)

    const budgetOmitted = this.omittedAt(this.total)
    const [keptPrefix, keptSuffix] = budgetOmitted > 0
      ? [trimTrailingPartialUtf8(prefix), trimLeadingContinuationUtf8(suffix)]
      : [prefix, suffix]
    const text = budgetOmitted > 0
      ? decoder.decode(keptPrefix) + decoder.decode(keptSuffix)
      : decoder.decode(concat([prefix, suffix]))

    const omitted = this.total - keptPrefix.length - keptSuffix.length
    const truncated = omitted > 0

    return {
      text,
      truncated,
      omittedBytes: truncated
        ? { kind: 'exact', count: omitted }
        : { kind: 'none' },
    }
  }
}

function concat(chunks) {
  let length = 0
  for (const chunk of chunks) length += chunk.length
  const out = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

export function describeOmitted(omitted, unit) {
  switch (omitted.kind) {
    case 'none':
      return ''
    case 'exact':
      return `Omitted ${omitted.count} ${unit}.`
    case 'unknown':
      return `More ${unit} were omitted.`
  }
}

export function formatRetentionNotice(notice, recovery) {
  return [describeOmitted(notice.omitted, notice.unit), recovery(notice)]
    .filter(part => part.length > 0)
    .join(' ')
}
