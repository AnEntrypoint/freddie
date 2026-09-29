export const SESSION_SEARCH_RESULT_LIMIT = 20

export const SESSION_SEARCH_SNIPPET_MAX_CODE_POINTS = 240

export function truncateUnicodeCodePoints(value, maximum) {
  let count = 0
  let end = 0
  for (const codePoint of value) {
    if (count === maximum) return value.slice(0, end)
    count++
    end += codePoint.length
  }
  return value
}
