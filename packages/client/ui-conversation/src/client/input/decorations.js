const TEXT_REF_RE = /(^|\s)([/@])([\w-]+)/g
const FOLDER_REF_RE = /(^|\s)(@(?:"[^"\n]*\/|[^\s"]+\/))/g

export function scanTextRefs(draft, lexicon) {
  if (draft === '') return []
  const out = []
  if (lexicon.size > 0) {
    TEXT_REF_RE.lastIndex = 0
    let m
    while ((m = TEXT_REF_RE.exec(draft)) !== null) {
      const trigger = m[2]
      const name = m[3] ?? ''
      if (lexicon.get(trigger)?.includes(name)) {
        const start = m.index + (m[1]?.length ?? 0)
        out.push({ start, end: start + 1 + name.length, trigger })
      }
    }
  }
  FOLDER_REF_RE.lastIndex = 0
  let folder
  while ((folder = FOLDER_REF_RE.exec(draft)) !== null) {
    const token = folder[2] ?? ''
    const start = folder.index + (folder[1]?.length ?? 0)
    const end = start + token.length
    if (!out.some(range => range.start < end && range.end > start)) {
      out.push({ start, end, trigger: '@', appearance: 'folder' })
    }
  }
  return out.sort((left, right) => left.start - right.start)
}

const EMPTY_LEXICON = new Map()

export function deriveDecorations(state, lexicon = EMPTY_LEXICON) {
  const { draft, claim, phase, occurrences } = state
  const claimActive = (phase === 'claimed' || phase === 'submitting')
    && claim !== undefined && draft.startsWith(claim.token)
  const token = claimActive ? { start: 0, end: claim.token.length } : null
  const chips = occurrences.map(o => ({
    occurrenceId: o.occurrenceId,
    offset: o.offset,
    length: o.length,
    text: draft.slice(o.offset, o.offset + o.length),
    label: o.label,
    ...o.appearance === undefined ? {} : { appearance: o.appearance },
    invalid: o.invalid === true,
  }))
  const hint = claimActive && claim.hint !== undefined && draft.slice(claim.token.length).trim() === ''
    ? claim.hint
    : null
  return { token, chips, textRefs: scanTextRefs(draft, lexicon), hint }
}
