import Anser from 'anser'

const TOKEN_BY_BASIC_RGB = {
  '0,0,0': 'var(--freddie-alias-label-primary)',
  '255,255,255': 'var(--freddie-alias-label-primary)',
  '85,85,85': 'var(--freddie-alias-label-tertiary)',
  '187,0,0': 'var(--freddie-alias-state-error-primary)',
  '255,85,85': 'var(--freddie-alias-state-error-secondary)',
  '0,187,0': 'var(--freddie-alias-state-success-primary)',
  '0,255,0': 'var(--freddie-alias-state-success-secondary)',
  '187,187,0': 'var(--freddie-alias-state-warn-primary)',
  '255,255,85': 'var(--freddie-alias-state-warn-secondary)',
  '0,0,187': 'var(--freddie-alias-state-business-primary)',
  '85,85,255': 'var(--dsw-static-blue-400)',
}

const STYLE_BY_DECORATION = {
  bold: 'font-weight: 700',
  dim: 'opacity: 0.7',
  italic: 'font-style: italic',
  underline: 'text-decoration: underline',
  strikethrough: 'text-decoration: line-through',
  hidden: 'visibility: hidden',
}

const OSC_SEQUENCE = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g

const NON_CSI_ESCAPE = /\u001b(?!\[)[\u0020-\u002f]*[\u0030-\u007e]?/g

const INERT_CONTROL = /[\u0000-\u0007\u000b-\u001a\u001c-\u001f\u007f]/g

const NEEDS_REPLAY = /\r|\u0008|\u001b\[[\u0030-\u003f]*[\u0020-\u002f]*K/

const SGR_SEQUENCE = /\u001b\[([\u0030-\u003f]*)[\u0020-\u002f]*m/g

const TAB_WIDTH = 8

const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}\u200b-\u200f\u2060]$/u

const WIDE_SCRIPT_RANGES = [
  [0x1100, 0x11ff], [0x2e80, 0x2e99], [0x2e9b, 0x2ef3], [0x2f00, 0x2fd5],
  [0x3005, 0x3005], [0x3007, 0x3007], [0x3021, 0x3029], [0x302e, 0x302f],
  [0x3038, 0x303b], [0x3041, 0x3096], [0x309d, 0x309f], [0x30a1, 0x30fa],
  [0x30fd, 0x30ff], [0x3131, 0x318e], [0x31f0, 0x321e], [0x3260, 0x327e],
  [0x32d0, 0x32fe], [0x3300, 0x3357], [0x3400, 0x4dbf], [0x4e00, 0x9fff],
  [0xa960, 0xa97c], [0xac00, 0xd7a3], [0xd7b0, 0xd7c6], [0xd7cb, 0xd7fb],
  [0xf900, 0xfa6d], [0xfa70, 0xfad9], [0xff66, 0xff6f], [0xff71, 0xff9d],
  [0xffa0, 0xffbe], [0xffc2, 0xffc7], [0xffca, 0xffcf], [0xffd2, 0xffd7],
  [0xffda, 0xffdc], [0x16fe2, 0x16fe3], [0x16ff0, 0x16ff6], [0x1aff0, 0x1aff3],
  [0x1aff5, 0x1affb], [0x1affd, 0x1affe], [0x1b000, 0x1b122], [0x1b132, 0x1b132],
  [0x1b150, 0x1b152], [0x1b155, 0x1b155], [0x1b164, 0x1b167], [0x1f200, 0x1f200],
  [0x20000, 0x2a6df], [0x2a700, 0x2b81d], [0x2b820, 0x2cead], [0x2ceb0, 0x2ebe0],
  [0x2ebf0, 0x2ee5d], [0x2f800, 0x2fa1d], [0x30000, 0x3134a], [0x31350, 0x33479],
]

const rangeClass = ranges =>
  ranges.map(([low, high]) => `\\u{${low.toString(16)}}-\\u{${high.toString(16)}}`).join('')

const WIDE_CHAR = new RegExp(
  `[${rangeClass(WIDE_SCRIPT_RANGES)}]`
  + '|\\p{Emoji_Presentation}'
  + '|[\\uff01-\\uff60\\u3000-\\u303e]',
  'u',
)

function isWide(char) {
  const code = char.codePointAt(0)
  if (code === undefined || code < 0x1100) return false
  return WIDE_CHAR.test(char)
}


const SGR_NONE = { fg: '', bg: '', attrs: [] }

const ATTR_CLOSERS = {
  22: ['1', '2'], 23: ['3'], 24: ['4'], 25: ['5', '6'], 27: ['7'], 28: ['8'], 29: ['9'],
}

function foldSgr(state, params) {
  const codes = params === '' ? ['0'] : params.split(';')
  let next = state
  for (let index = 0; index < codes.length; index++) {
    const code = String(codes[index])
    if (code === '' || code === '0') { next = SGR_NONE; continue }
    if (code === '38' || code === '48') {
      const colorMode = codes[index + 1] ?? ''
      const argumentCount = colorMode === '2' ? 4 : colorMode === '5' ? 2 : 0
      const value = codes.slice(index, index + argumentCount + 1).join(';')
      next = code === '38' ? { ...next, fg: value } : { ...next, bg: value }
      index += argumentCount
      continue
    }
    const closes = ATTR_CLOSERS[code]
    if (closes !== undefined) {
      next = { ...next, attrs: next.attrs.filter(attr => !closes.includes(attr)) }
      continue
    }
    const numeric = Number(code)
    if (code === '39') { next = { ...next, fg: '' }; continue }
    if (code === '49') { next = { ...next, bg: '' }; continue }
    if ((numeric >= 30 && numeric <= 37) || (numeric >= 90 && numeric <= 97)) { next = { ...next, fg: code }; continue }
    if ((numeric >= 40 && numeric <= 47) || (numeric >= 100 && numeric <= 107)) { next = { ...next, bg: code }; continue }
    if (!next.attrs.includes(code)) next = { ...next, attrs: [...next.attrs, code] }
  }
  return next
}

function openSgr(state) {
  const codes = [...state.attrs]
  if (state.fg !== '') codes.push(state.fg)
  if (state.bg !== '') codes.push(state.bg)
  return codes.length === 0 ? '' : `\u001b[${codes.join(';')}m`
}

function sameSgr(a, b) {
  return a.fg === b.fg && a.bg === b.bg && a.attrs.length === b.attrs.length
    && a.attrs.every((attr, index) => attr === b.attrs[index])
}

function replayLine(line, entrySgr) {
  const anserCsiSequence = /\u001b\[([\u0030-\u003f]*)[\u0020-\u002f]*([\u0040-\u007e])/g
  const columns = []
  let cursor = 0
  let sgr = entrySgr
  let at = 0

  const clear = (index, fill) => {
    const cell = columns[index]
    if (cell?.spacer === true && index > 0) columns[index - 1] = { sgr, char: fill }
    else if (cell !== undefined && isWide(cell.char) && columns[index + 1]?.spacer === true) {
      columns[index + 1] = { sgr, char: fill }
    }
    columns[index] = { sgr, char: fill }
  }

  const consume = (chunk) => {
    for (const char of chunk) {
      if (char === '\r') { cursor = 0; continue }
      if (char === '\u0008') { cursor = Math.max(0, cursor - 1); continue }
      if (char === '\t') {
        const nextTabStop = cursor + TAB_WIDTH - (cursor % TAB_WIDTH)
        for (; cursor < nextTabStop; cursor++) columns[cursor] ??= { sgr, char: ' ' }
        continue
      }
      if (ZERO_WIDTH.test(char)) {
        const hostCell = cursor > 0 ? columns[cursor - 1] : undefined
        if (hostCell !== undefined) columns[cursor - 1] = { sgr: hostCell.sgr, char: hostCell.char + char }
        continue
      }
      clear(cursor, ' ')
      columns[cursor] = { sgr, char }
      cursor++
      if (isWide(char)) { columns[cursor] = { sgr, char: '', spacer: true }; cursor++ }
    }
  }

  for (const match of line.matchAll(anserCsiSequence)) {
    consume(line.slice(at, match.index))
    at = match.index + match[0].length
    const params = String(match[1])
    const final = String(match[2])
    if (final === 'K') {
      const eraseMode = String(params.split(';')[0])
      if (eraseMode === '1') for (let index = 0; index <= cursor; index++) clear(index, ' ')
      else columns.length = eraseMode === '2' ? 0 : cursor
      continue
    }
    if (final !== 'm') continue
    sgr = foldSgr(sgr, params)
  }
  consume(line.slice(at))

  let out = ''
  let active = entrySgr
  for (let index = 0; index < columns.length; index++) {
    const column = columns[index] ?? { sgr: SGR_NONE, char: ' ' }
    if (!sameSgr(column.sgr, active)) {
      if (!sameSgr(active, SGR_NONE)) out += '\u001b[0m'
      out += openSgr(column.sgr)
      active = column.sgr
    }
    const leadIntact = index > 0 && isWide(columns[index - 1]?.char ?? '')
    out += column.spacer === true && !leadIntact ? ' ' : column.char
  }
  if (!sameSgr(active, sgr)) {
    if (!sameSgr(active, SGR_NONE)) out += '\u001b[0m'
    out += openSgr(sgr)
  }
  return { text: out, sgr }
}

function applyCursorMovements(text) {
  const replayed = []
  let sgr = SGR_NONE
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r+$/, '')
    if (NEEDS_REPLAY.test(line)) {
      const result = replayLine(line, sgr)
      replayed.push(result.text)
      sgr = result.sgr
      continue
    }
    replayed.push(line)
    for (const match of line.matchAll(SGR_SEQUENCE)) sgr = foldSgr(sgr, String(match[1]))
  }
  return replayed.join('\n')
}

function sanitize(text) {
  const escaped = text.replace(OSC_SEQUENCE, '').replace(NON_CSI_ESCAPE, '')
  return applyCursorMovements(escaped).replace(INERT_CONTROL, '')
}

function resolveStyle(chunk) {
  const declarations = new Map()
  const background = chunk.bg === null ? undefined : `rgb(${chunk.bg})`
  if (background !== undefined) declarations.set('background-color', background)
  if (chunk.fg !== null) {
    const literal = `rgb(${chunk.fg})`
    const paintsOwnBackground = background !== undefined
    declarations.set('color', paintsOwnBackground
      ? literal
      : TOKEN_BY_BASIC_RGB[chunk.fg.replace(/\s+/g, '')] ?? literal)
  }
  for (const decoration of chunk.decorations) {
    const rule = STYLE_BY_DECORATION[decoration]
    if (rule === undefined) continue
    const [property, value] = rule.split(': ')
    if (property !== undefined && value !== undefined) declarations.set(property, value)
  }
  if (declarations.size === 0) return undefined
  return [...declarations].map(([property, value]) => `${property}: ${value}`).join('; ')
}

export function parseAnsiLines(text) {
  let current = []
  const lines = [current]
  for (const chunk of Anser.ansiToJson(sanitize(text), { json: true, remove_empty: true })) {
    const style = resolveStyle(chunk)
    for (const [index, part] of chunk.content.split('\n').entries()) {
      if (index > 0) {
        current = []
        lines.push(current)
      }
      if (part !== '') current.push({ text: part, style })
    }
  }
  return lines
}
