import { z } from 'zod'

const CHUNK_CAPACITY = 64


export function appendChunkedList(head, value) {
  if (head === undefined || head.values.length === CHUNK_CAPACITY) {
    return { values: [value], ...head === undefined ? {} : { previous: head } }
  }
  return {
    values: [...head.values, value],
    ...head.previous === undefined ? {} : { previous: head.previous },
  }
}

export function* iterateChunkedList(head) {
  const chunks = []
  for (let chunk = head; chunk !== undefined; chunk = chunk.previous) chunks.push(chunk)
  for (const chunk of chunks.reverse()) yield* chunk.values
}

export function chunkedListSchema(valueSchema) {
  const schema = z.lazy(() => z.object({
    values: z.array(valueSchema).min(1).max(CHUNK_CAPACITY),
    previous: schema.optional(),
  }).strict())
  return schema
}
