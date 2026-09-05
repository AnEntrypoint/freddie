/** Canonical packed-row and envelope projection helpers for repository session fixtures. */

import { deepStrictEqual } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { packChunkRuns } from '@freddie/freddie-session'
import { parseSessionLog } from '@freddie/freddie-llm-replay'

function isSessionHeader(value) {
  return value !== null && typeof value === 'object' && (value).type === 'session'
}

function renderFixture(headerLine, events) {
  return [
    headerLine,
    ...packChunkRuns(events).map((stored) => {
      const record = stored
      delete record.seq
      delete record.time
      delete record.seq0
      delete record.time0
      return JSON.stringify(record)
    }),
    '',
  ].join('\n')
}

function withoutEnvelope(events) {
  return events.map((event) => {
    const { seq: _seq, time: _time, ...projected } = event
    return projected
  })
}

/**
 * Canonicalize one JSONL document when its first record is a session header.
 * The header line remains byte-identical; body records decode to logical events,
 * re-encode with {@link packChunkRuns}, and omit storage sequence/time envelopes.
 * Non-session JSONL returns undefined.
 *
 * @param content - JSONL source text.
 * @param label - path-like diagnostic label.
 * @returns Canonical text for a session fixture, otherwise undefined.
 */
export function canonicalSessionFixture(content, label = '<session-fixture>') {
  const headerLine = content.split(/\r?\n/).find(line => line.trim().length > 0)
  if (headerLine === undefined) return undefined

  let headerValue
  try {
    headerValue = JSON.parse(headerLine)
  } catch {
    return undefined
  }
  if (!isSessionHeader(headerValue)) return undefined

  let events
  try {
    events = parseSessionLog(content)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`${label}: ${detail}`, { cause: error })
  }
  const canonical = renderFixture(headerLine, events)
  const decoded = parseSessionLog(canonical)
  try {
    deepStrictEqual(withoutEnvelope(decoded), withoutEnvelope(events))
  } catch (error) {
    throw new Error(`${label}: packed snapshot rewrite changed the event payload stream`, { cause: error })
  }
  if (renderFixture(headerLine, decoded) !== canonical) {
    throw new Error(`${label}: packed rewrite is not idempotent`)
  }
  return canonical
}

/**
 * Discover tracked and unignored untracked JSONL files through Git.
 *
 * @param root - repository root.
 * @returns Stable repository-relative paths.
 */
function discoverJsonlFiles(root) {
  return execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.jsonl'],
    { cwd: root, encoding: 'utf8' },
  ).split('\0')
    .filter(path => path.length > 0 && existsSync(resolve(root, path)))
    .sort()
}

/**
 * Inspect every repository JSONL whose first record is a session header.
 *
 * @param root - repository root.
 * @returns Session fixtures with current and canonical text.
 */
export function inspectSessionFixtureLayouts(root) {
  return discoverJsonlFiles(root).flatMap((path) => {
    const source = readFileSync(resolve(root, path), 'utf8')
    const canonical = canonicalSessionFixture(source, path)
    return canonical === undefined ? [] : [{ path, source, canonical }]
  })
}
