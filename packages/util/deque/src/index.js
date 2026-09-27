/** Zero-dependency circular deque for queues that retain entries across asynchronous work. */

const MIN_CAPACITY = 16

/**
 * A circular deque with amortized constant-time insertion and removal.
 * Removed entries are cleared immediately, and sparse storage shrinks after
 * the live entry count reaches one quarter of its capacity.
 * @template T
 */
export class Deque {
  constructor() {
    /** @type {(T | undefined)[]} */
    this.buffer = new Array(MIN_CAPACITY)
    this.head = 0
    this.count = 0
  }

  /** Number of entries available to remove. */
  get size() {
    return this.count
  }

  /**
   * Append one entry after the current tail.
   * @param {T} value - entry to append.
   */
  pushBack(value) {
    this.ensureCapacity()
    const tail = this.head + this.count
    this.buffer[tail < this.buffer.length ? tail : tail - this.buffer.length] = value
    this.count += 1
  }

  /**
   * Insert one entry before the current head.
   * @param {T} value - entry to prepend.
   */
  pushFront(value) {
    this.ensureCapacity()
    this.head = this.head === 0 ? this.buffer.length - 1 : this.head - 1
    this.buffer[this.head] = value
    this.count += 1
  }

  /**
   * Remove the current head entry and clear its retained reference.
   * Callers whose element type includes `undefined` use {@link Deque#size} to
   * distinguish an empty deque from an `undefined` entry.
   * @returns {T | undefined} the removed entry, or `undefined` when the deque is empty.
   */
  popFront() {
    if (this.count === 0) return undefined
    const value = this.buffer[this.head]
    this.buffer[this.head] = undefined
    this.head += 1
    if (this.head === this.buffer.length) this.head = 0
    this.count -= 1
    this.compact()
    return value
  }

  /** Drop every entry and release the current backing storage. */
  clear() {
    this.buffer = new Array(MIN_CAPACITY)
    this.head = 0
    this.count = 0
  }

  ensureCapacity() {
    if (this.count < this.buffer.length) return
    this.resize(this.buffer.length * 2)
  }

  compact() {
    if (this.count === 0) {
      this.head = 0
      return
    }
    if (this.buffer.length > MIN_CAPACITY && this.count <= this.buffer.length / 4) {
      this.resize(Math.max(MIN_CAPACITY, this.buffer.length / 2))
    }
  }

  /** @param {number} capacity */
  resize(capacity) {
    const next = new Array(capacity)
    let source = this.head
    for (let index = 0; index < this.count; index += 1) {
      next[index] = this.buffer[source]
      source += 1
      if (source === this.buffer.length) source = 0
    }
    this.buffer = next
    this.head = 0
  }
}
