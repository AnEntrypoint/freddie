const LEGAL_API_KEY = /^[\x21-\x7E]+$/

export function normalizeApiKey(raw) {
  const value = raw.trim()
  if (value.length === 0) return { ok: false, reason: 'empty' }
  if (!LEGAL_API_KEY.test(value)) return { ok: false, reason: 'illegalCharacters' }
  return { ok: true, value }
}
