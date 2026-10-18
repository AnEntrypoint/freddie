const MIN_CAPACITY = 16

export class Deque {
  constructor() {
    this.buffer = new Array(MIN_CAPACITY)
    this.head = 0
    this.count = 0
  }

  get size() {
    return this.count
  }

  pushBack(value) {
    this.ensureCapacity()
    const tail = this.head + this.count
    this.buffer[tail < this.buffer.length ? tail : tail - this.buffer.length] = value
    this.count += 1
  }

  pushFront(value) {
    this.ensureCapacity()
    this.head = this.head === 0 ? this.buffer.length - 1 : this.head - 1
    this.buffer[this.head] = value
    this.count += 1
  }

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
