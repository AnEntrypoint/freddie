/** Persistent append-only lists with bounded copying and JSON checkpoint validation. */

import { z } from 'zod'

const CHUNK_CAPACITY = 64

/**
 * Newest chunk of an immutable list; `undefined` represents the empty list.
 * Values within each chunk follow insertion order. Callers treat nodes, arrays,
 * and stored values as immutable; operations share values and older chunks.
 * @template T
 * @typedef {{ readonly values: readonly T[]; readonly previous?: ChunkedList<T> | undefined }} ChunkedList
 */

/**
 * Append without modifying the input, copying at most one 64-value chunk.
 * @template T
 * @param {ChunkedList<T> | undefined} head - current list, or `undefined` for an empty list.
 * @param {T} value - value to retain by reference.
 * @returns {ChunkedList<T>} new list sharing the unchanged older chunks.
 */
export function appendChunkedList(head, value) {
  if (head === undefined || head.values.length === CHUNK_CAPACITY) {
    return { values: [value], ...head === undefined ? {} : { previous: head } }
  }
  return {
    values: [...head.values, value],
    ...head.previous === undefined ? {} : { previous: head.previous },
  }
}

/**
 * Visit all values in insertion order, with O(N) time and O(N / 64) scratch space.
 * @template T
 * @param {ChunkedList<T> | undefined} head - current list, or `undefined` for an empty list.
 * @returns {Generator<T>} iterator yielding the stored values by reference, without truncation.
 */
export function* iterateChunkedList(head) {
  const chunks = []
  for (let chunk = head; chunk !== undefined; chunk = chunk.previous) chunks.push(chunk)
  for (const chunk of chunks.reverse()) yield* chunk.values
}

/**
 * Validate nonempty list checkpoints, including every stored value and chunk size.
 * @template T
 * @param {z.ZodType<T>} valueSchema - caller-owned validation for each stored value.
 * @returns {z.ZodType<ChunkedList<T>>} recursive Zod schema rejecting empty or oversized chunks and unknown fields.
 */
export function chunkedListSchema(valueSchema) {
  const schema = z.lazy(() => z.object({
    values: z.array(valueSchema).min(1).max(CHUNK_CAPACITY),
    previous: schema.optional(),
  }).strict())
  return schema
}
