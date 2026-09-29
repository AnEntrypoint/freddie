import { join } from 'node:path'
import { decodeStorageRecord, packChunkRuns, SESSION_FORMAT_VERSION } from '@freddie/freddie-session'
import { SessionFormatUnsupportedError, sessionFormatVersionRefusal } from '@freddie/freddie-session-persistence'

export function logSuffix(compression) {
  return compression === 'zstd' ? '.jsonl.zstd' : '.jsonl'
}

export function toHeaderLine(header) {
  return {
    type: 'session',
    version: header.version,
    id: header.id,
    createdAt: header.createdAt,
    ...header.cwd !== undefined ? { cwd: header.cwd } : {},
    ...header.parentSession !== undefined ? { parentSession: header.parentSession } : {},
    ...header.seedLength !== undefined ? { seedLength: header.seedLength } : {},
    ...header.origin !== undefined ? { origin: header.origin } : {},
    delegationDepth: header.delegationDepth ?? 0,
    ...header.agentPreset !== undefined ? { agentPreset: header.agentPreset } : {},
  }
}

export function fromHeaderLine(line) {
  if (Object.hasOwn(line, 'sandboxMode') || Object.hasOwn(line, 'approvalPolicy')) {
    throw new Error('session header uses retired policy baseline fields')
  }
  return {
    version: line.version,
    id: line.id,
    createdAt: line.createdAt,
    ...line.cwd !== undefined ? { cwd: line.cwd } : {},
    ...line.parentSession !== undefined ? { parentSession: line.parentSession } : {},
    ...line.seedLength !== undefined ? { seedLength: line.seedLength } : {},
    ...line.origin !== undefined ? { origin: line.origin } : {},
    delegationDepth: line.delegationDepth,
    ...line.agentPreset !== undefined ? { agentPreset: line.agentPreset } : {},
  }
}

function isHeaderLine(value) {
  return (
    typeof value === 'object' && value !== null
    && value.type === 'session'
    && typeof value.version === 'number'
    && typeof value.id === 'string'
    && typeof value.createdAt === 'number'
    && Number.isSafeInteger(value.createdAt)
    && value.createdAt >= 0
    && !Object.is(value.createdAt, -0)
    && typeof value.delegationDepth === 'number'
    && Number.isSafeInteger(value.delegationDepth)
    && value.delegationDepth >= 0
    && !Object.is(value.delegationDepth, -0)
    && (value.origin === undefined || value.origin === 'subagent')
    && (value.agentPreset === undefined || typeof value.agentPreset === 'string')
  )
}

export function encodeSegment(raw) {
  if (raw.length === 0) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      out += ch
    } else {
      out += '~' + code.toString(16).toUpperCase().padStart(4, '0')
    }
  }
  return out
}

export function projectKey(cwd) {
  if (cwd.length === 0) throw new Error('cannot encode an empty project path')
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  const slug = readable.replace(/^-+/, '') || 'root'
  return `--${slug.slice(0, 251)}--`
}

export function projectDir(root, cwd) {
  if (cwd === undefined) return join(root, '_no-cwd')
  return join(root, projectKey(cwd))
}

export function sessionDir(root, cwd, id) {
  return join(projectDir(root, cwd), encodeSegment(id))
}

export function logPath(root, cwd, id, compression) {
  return join(sessionDir(root, cwd, id), `session${logSuffix(compression)}`)
}

export function eventLines(events, packChunks) {
  const records = packChunks ? packChunkRuns(events) : events
  return records.map(record => JSON.stringify(record)).join('\n')
}

function refuseForeignFormatVersion(parsed) {
  if (typeof parsed !== 'object' || parsed === null) return
  const { version, id } = parsed
  if (typeof version !== 'number' || version === SESSION_FORMAT_VERSION) return
  throw new SessionFormatUnsupportedError(
    sessionFormatVersionRefusal(typeof id === 'string' ? id : String(id), version),
  )
}

function parseHeaderRecord(record) {
  if (record.length === 0 || record.at(-1) !== 0x0A || record.indexOf(0x0A) !== record.length - 1) {
    throw new Error('empty or header-less session log')
  }
  let parsed
  try {
    parsed = JSON.parse(record.subarray(0, -1).toString('utf8'))
  } catch {
    throw new Error('corrupt session log: header line is not valid JSON')
  }
  refuseForeignFormatVersion(parsed)
  if (!isHeaderLine(parsed)) {
    throw new Error('corrupt session log: first line is not a session header')
  }
  return fromHeaderLine(parsed)
}

export class SessionLogScanner {
  meta
  events = []
  fragments = []
  fragmentBytes = 0
  inputBytes
  committedBytes
  eventLine = 0
  issue
  finished = false

  constructor(headerRecord) {
    this.meta = parseHeaderRecord(headerRecord)
    this.inputBytes = headerRecord.length
    this.committedBytes = headerRecord.length
  }

  write(chunk) {
    if (this.finished) throw new Error('cannot write to a finished session log scanner')
    const chunkStart = this.inputBytes
    this.inputBytes += chunk.length
    let lineStart = 0
    for (
      let newline = chunk.indexOf(0x0A);
      newline !== -1;
      newline = chunk.indexOf(0x0A, lineStart)
    ) {
      const fragment = chunk.subarray(lineStart, newline)
      let line = fragment
      if (this.fragments.length > 0) {
        if (fragment.length > 0) this.fragments.push(fragment)
        line = Buffer.concat(this.fragments, this.fragmentBytes + fragment.length)
        this.fragments = []
        this.fragmentBytes = 0
      }
      this.consumeEventLine(line, chunkStart + newline + 1)
      lineStart = newline + 1
    }
    if (lineStart < chunk.length) {
      const fragment = Buffer.from(chunk.subarray(lineStart))
      this.fragments.push(fragment)
      this.fragmentBytes += fragment.length
    }
  }

  checkpoint() {
    return {
      inputBytes: this.inputBytes,
      committedBytes: this.committedBytes,
      eventCount: this.events.length,
    }
  }

  finish() {
    this.finished = true
    return { meta: this.meta, events: this.events, committedBytes: this.committedBytes }
  }

  consumeEventLine(line, endByte) {
    this.eventLine += 1
    let decoded
    try {
      decoded = decodeStorageRecord(JSON.parse(line.toString('utf8')))
    } catch {
      this.issue ??= new Error(`corrupt session log: unparsable committed event at line ${this.eventLine}`)
      return
    }

    if (this.issue !== undefined) {
      if (decoded.some(event => event.type === 'turn/end')) throw this.issue
      return
    }

    const rowStart = this.events.length
    for (const event of decoded) {
      if (event.seq !== this.events.length) {
        const expected = this.events.length
        this.events.length = rowStart
        this.issue = new Error(
          `corrupt session log: seq gap in committed region at line ${this.eventLine} `
          + `(expected ${expected}, got ${event.seq})`,
        )
        if (decoded.some(candidate => candidate.type === 'turn/end')) throw this.issue
        return
      }
      this.events.push(event)
    }
    this.committedBytes = endByte
  }
}

export function scanLog(buffer) {
  const headerEnd = buffer.indexOf(0x0A)
  if (headerEnd === -1) throw new Error('empty or header-less session log')
  const scanner = new SessionLogScanner(buffer.subarray(0, headerEnd + 1))
  scanner.write(buffer.subarray(headerEnd + 1))
  return scanner.finish()
}

export function parseHeaderMeta(firstLine) {
  let parsed
  try {
    parsed = JSON.parse(firstLine)
  } catch {
    return undefined
  }
  if (!isHeaderLine(parsed)) return undefined
  return fromHeaderLine(parsed)
}
