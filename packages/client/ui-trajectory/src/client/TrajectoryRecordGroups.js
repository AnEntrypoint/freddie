import { trajectoryRecordId } from './trajectory-record.js'

export function flattenRecords(turns) {
  return turns.flatMap((turn, section) => {
    let firstInSection = true
    const records = turn.groups.flatMap((group) => {
      return group.cells.map((cell, index) => {
        const turnStart = firstInSection
          && cell.requestOnly !== true
          && cell.kind !== 'system'
          && (cell.kind !== 'compacted' || turn.turn === null)
        if (turnStart) firstInSection = false
        return {
          turn: turn.turn,
          section,
          group: group.title,
          groupStart: index === 0,
          turnStart,
          cell,
          turnEnd: false,
        }
      })
    })
    const last = records.at(-1)
    if (last !== undefined) last.turnEnd = true
    return records
  })
}

export function filterRecords(
  records,
  matches,
) {
  const filtered = records
    .filter(record =>
      record.cell.requestOnly !== true && matches.has(record.cell.index),
    )
    .map(record => ({ ...record, groupStart: false, turnStart: false, turnEnd: false }))
  const startedSections = new Set()
  for (const [index, record] of filtered.entries()) {
    const previous = filtered[index - 1]
    const next = filtered[index + 1]
    record.groupStart = previous === undefined
      || previous.section !== record.section
      || previous.group !== record.group
    record.turnStart = !startedSections.has(record.section)
      && record.cell.kind !== 'system'
      && (record.cell.kind !== 'compacted' || record.turn === null)
    if (record.turnStart) startedSections.add(record.section)
    record.turnEnd = next === undefined || next.section !== record.section
  }
  return filtered
}

function requestStep(group) {
  if (!group.startsWith('Step ')) return undefined
  const value = Number(group.slice('Step '.length))
  return Number.isInteger(value) && value > 0 ? value : undefined
}

export function requestKey(turn, group) {
  return `${turn}\u0000${group}`
}

export function indexRequestBoundaries(records) {
  const boundaries = new Map()
  for (const record of records) {
    const key = requestKey(record.turn, record.group)
    if (boundaries.has(key)) continue
    if (requestStep(record.group) === undefined) {
      if (record.groupStart) boundaries.set(key, record.cell.index)
      continue
    }
    if (record.cell.kind === 'user' || record.cell.kind === 'context') continue
    boundaries.set(key, record.cell.index)
  }
  return boundaries
}

export function sectionLabel(turn) {
  return turn === null ? 'Between turns' : `Turn ${turn}`
}

export function indexRequestNumbers(
  records,
  sessionNumbers,
  boundaries,
) {
  const numbers = new Map()
  for (const request of sessionNumbers ?? []) {
    numbers.set(requestKey(request.turn, request.group), request.number)
  }
  let next = Math.max(0, ...numbers.values()) + 1
  const boundaryRecords = records
    .filter(record => boundaries.get(requestKey(record.turn, record.group)) === record.cell.index
      && requestStep(record.group) !== undefined)
    .sort((left, right) => left.cell.index - right.cell.index)
  for (const record of boundaryRecords) {
    const key = requestKey(record.turn, record.group)
    if (!numbers.has(key)) numbers.set(key, next++)
  }
  return numbers
}

export function indexRequestBoundaryRuns(records) {
  const indexes = new Map()
  let runLength = 0
  for (const record of records) {
    if (record.cell.requestOnly === true) {
      indexes.set(record.cell.index, runLength++)
      continue
    }
    if (runLength > 0 && record.groupStart && requestStep(record.group) !== undefined) {
      indexes.set(record.cell.index, runLength)
    }
    runLength = 0
  }
  return indexes
}

function summarizeTurn(records) {
  const steps = new Set(
    records
      .map(record => record.group)
      .filter(group => group.startsWith('Step ')),
  ).size
  const toolCalls = records.filter(record =>
    record.cell.kind === 'tool' || record.cell.kind === 'subtool',
  ).length
  return [
    `${steps} ${steps === 1 ? 'step' : 'steps'}`,
    `${toolCalls} tool ${toolCalls === 1 ? 'call' : 'calls'}`,
  ].join(' · ')
}

export function collapseTurnRecords(
  records,
  collapsedTurns,
) {
  const recordsByTurn = new Map()
  for (const record of records) {
    if (record.turn === null) continue
    const turnRecords = recordsByTurn.get(record.turn) ?? []
    turnRecords.push(record)
    recordsByTurn.set(record.turn, turnRecords)
  }
  return records.flatMap((record) => {
    if (record.turn === null || !collapsedTurns.has(record.turn)) return [record]
    const turnRecords = recordsByTurn.get(record.turn) ?? [record]
    if (record.cell.requestOnly === true || record.cell.kind === 'system') return [record]
    const contentRecords = turnRecords.filter(candidate =>
      candidate.cell.requestOnly !== true && candidate.cell.kind !== 'system')
    if (contentRecords.length <= 1) return [record]
    if (record.cell.index !== contentRecords[0]?.cell.index) return []
    return [
      { ...record, turnEnd: false },
      {
        ...record,
        groupStart: false,
        turnStart: false,
        turnEnd: true,
        collapsedSummary: summarizeTurn(contentRecords.slice(1)),
        collapsedSummaryKind: 'turn',
      },
    ]
  })
}

export function assistantToolCalls(
  records,
  assistantIndex,
) {
  const at = records.findIndex(record => record.cell.index === assistantIndex)
  if (at === -1 || records[at]?.cell.kind !== 'message') return []
  const calls = []
  for (let i = at + 1; i < records.length; i++) {
    const record = records[i]
    if (record === undefined) break
    if (record.cell.kind !== 'tool' && record.cell.kind !== 'subtool') break
    calls.push(record)
  }
  return calls
}

function summarizeAssistantTools(records) {
  const names = [...new Set(records.map((record) => {
    const separator = record.cell.text.indexOf(' · ')
    return separator === -1 ? record.cell.text : record.cell.text.slice(0, separator)
  }).filter(name => name !== ''))]
  const count = records.length
  const summary = `${count} tool ${count === 1 ? 'call' : 'calls'}`
  return names.length > 0 ? `${summary} · ${names.join(', ')}` : summary
}

export function collapseAssistantRecords(
  records,
  collapsedAssistants,
) {
  const out = []
  for (let i = 0; i < records.length; i++) {
    const record = records[i]
    if (record === undefined) continue
    out.push(record)
    if (
      record.cell.kind !== 'message'
      || !collapsedAssistants.has(trajectoryRecordId(record.cell))
    ) continue
    const calls = []
    for (let j = i + 1; j < records.length; j++) {
      const candidate = records[j]
      if (
        candidate === undefined
        || candidate.collapsedSummary !== undefined
        || (candidate.cell.kind !== 'tool' && candidate.cell.kind !== 'subtool')
      ) break
      calls.push(candidate)
    }
    if (calls.length === 0) continue
    const last = calls.at(-1)
    out[out.length - 1] = { ...record, turnEnd: false }
    out.push({
      ...record,
      groupStart: false,
      turnStart: false,
      turnEnd: last?.turnEnd ?? false,
      collapsedSummary: summarizeAssistantTools(calls),
      collapsedSummaryKind: 'assistant',
    })
    i += calls.length
  }
  return out
}

export function stateOf(record) {
  if (record.cell.isError) return 'error'
  if (record.cell.kind === 'compacted' && record.cell.timeSeconds === null) return 'running'
  if (
    (record.cell.kind === 'tool' || record.cell.kind === 'subtool')
    && record.cell.outputDetail === undefined
  ) return 'running'
  return 'complete'
}

export function statusLabel(state) {
  if (state === 'error') return 'Failed'
  if (state === 'running') return 'Pending'
  return 'Completed'
}
