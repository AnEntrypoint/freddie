import { existsSync } from 'node:fs'
import { isAbsolute, relative, sep } from 'node:path'
import { HarnessError } from '@freddie/freddie-llm'
import { ItemRetainer, TextRetainer } from '@freddie/freddie-output-retention'

export const RAW_OUTPUT_MAX_BYTES = 20_000_000

export const SEARCH_TIMEOUT_MS = 30_000

export const SEARCH_STDERR_MAX_BYTES = 64 * 1024

export const SEARCH_GRACE_MS = 3_000

export const SEARCH_META_MAX_BYTES = 65_536


export class SearchError extends HarnessError {
  constructor(message, code, options) {
    super(message, code, options)
    this.code = code
  }
}


function stderrExcerpt(stderrText, truncated) {
  const text = stderrText.trim()
  if (text.length === 0) return ''
  return truncated ? `${text} [stderr truncated]` : text
}

function classifyRunFailure(toolName, exitCode, stderrText, stderrTruncated) {
  const stderr = stderrExcerpt(stderrText, stderrTruncated)
  if (/regex parse error|error parsing glob/i.test(stderr)) {
    return new SearchError(`${toolName} pattern rejected by ripgrep: ${stderr}`, 'SEARCH_INVALID_PATTERN')
  }
  return new SearchError(`${toolName} search failed (exit ${exitCode})${stderr.length > 0 ? `: ${stderr}` : ''}`, 'SEARCH_FAILED')
}

function completeStdout(toolName, stdout, rawOutputMaxBytes) {
  const narrow = 'narrow pattern, path, or include and retry'
  if (!stdout.lossy) {
    const inlineBytes = Buffer.byteLength(stdout.text, 'utf8')
    if (inlineBytes > rawOutputMaxBytes) {
      throw new SearchError(
        `${toolName} produced ${inlineBytes} bytes of raw output, over the ${rawOutputMaxBytes}-byte cap; ${narrow}`,
        'SEARCH_RAW_OUTPUT_OVERFLOW',
      )
    }
    return stdout.text
  }
  throw new SearchError(
    `${toolName} produced more raw output than the subprocess seam retained within the ${rawOutputMaxBytes}-byte cap; ${narrow}`,
    'SEARCH_RAW_OUTPUT_OVERFLOW',
  )
}

let rgPathPromise

export function resolveRgPath() {
  rgPathPromise ??= Promise.resolve().then(async () => {
    const executableSidecar = `${process.execPath}-rg`
    if ('pkg' in process && existsSync(executableSidecar)) return executableSidecar
    return (await import('@vscode/ripgrep')).rgPath
  })
  return rgPathPromise
}

export async function runRipgrep(
  ctx,
  exec,
  toolName,
  argv,
  rawOutputMaxBytes,
  graceMs,
  stderrMaxBytes,
) {
  if (exec.signal.aborted) {
    throw new SearchError(`${toolName} was aborted before completion (tool timeout or caller cancellation)`, 'SEARCH_ABORTED')
  }
  const cwd = exec.agent?.session.header.cwd
  const workdir = cwd ?? process.cwd()
  let handle
  try {
    handle = ctx.subprocess.spawn({
      argv: [await resolveRgPath(), '--no-config', ...argv],
      cwd: workdir,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: rawOutputMaxBytes },
        stderr: { maxBytes: stderrMaxBytes },
      },
      graceMs,
      signal: exec.signal,
    })
  } catch (error) {
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    if (exec.signal.aborted) {
      throw new SearchError(`${toolName} was aborted before completion (tool timeout or caller cancellation)`, 'SEARCH_ABORTED')
    }
    throw new SearchError(`${toolName} could not start its search command (ripgrep launch failed)`, 'SEARCH_FAILED', { cause: error })
  }
  let outcome
  try {
    outcome = await handle.done
  } catch (error) {
    throw new SearchError(`${toolName} could not start its search command (ripgrep launch failed)`, 'SEARCH_FAILED', { cause: error })
  }
  const stdout = handle.collected.stdout?.readFrom(0)
  const stderr = handle.collected.stderr?.readFrom(0)
  if (stdout === undefined || stderr === undefined) {
    throw new SearchError(`${toolName} search command produced no collected output streams`, 'SEARCH_FAILED')
  }
  // oxlint-disable-next-line typescript/no-unnecessary-condition
  if (exec.signal.aborted) {
    throw new SearchError(`${toolName} was aborted before completion (tool timeout or caller cancellation)`, 'SEARCH_ABORTED')
  }
  if (outcome.signal !== null || outcome.exitCode === null) {
    throw new SearchError(`${toolName} search command was killed by signal ${outcome.signal ?? '(unknown)'}`, 'SEARCH_FAILED')
  }
  if (outcome.exitCode !== 0 && outcome.exitCode !== 1) {
    throw classifyRunFailure(toolName, outcome.exitCode, stderr.text, stderr.lossy)
  }
  const text = completeStdout(toolName, stdout, rawOutputMaxBytes)
  return { stdout: text, noMatches: outcome.exitCode === 1, workdir }
}

export function toWorkdirRelative(path, workdir) {
  if (!isAbsolute(path)) return path
  const rel = relative(workdir, path)
  if (rel.length === 0) return '.'
  if (rel === '..' || rel.startsWith(`..${sep}`)) return path
  return rel
}


export function previewLine(line, maxBytes) {
  const retainer = new TextRetainer({ kind: 'head', maxBytes })
  retainer.push(line)
  const kept = retainer.finish()
  return kept.truncated ? `${kept.text} (line truncated)` : kept.text
}

export function retainGrepMatches(matches, maxMatches, maxLineBytes) {
  const retainer = new ItemRetainer({ kind: 'head', maxItems: maxMatches })
  for (const match of matches) retainer.push({ ...match, line: previewLine(match.line, maxLineBytes) })
  return retainer.finish()
}

export function retainGlobPaths(paths, maxResults) {
  const retainer = new ItemRetainer({ kind: 'head', maxItems: maxResults })
  for (const path of paths) retainer.push(path)
  return retainer.finish()
}

export async function trySaveFormattedResult(
  ctx,
  exec,
  suggestedName,
  content,
) {
  const sessionId = exec.agent?.session.header.id
  if (sessionId === undefined) {
    ctx.logger.warn(`tool-fs-search: no session owner for ${exec.name} result; complete result not saved`)
    return undefined
  }
  const spillStore = ctx.get('spillStore')
  if (!spillStore) {
    ctx.logger.warn(`tool-fs-search: no ctx.spillStore backend loaded; complete ${exec.name} result not saved`)
    return undefined
  }
  const save = {
    owner: { sessionId },
    source: { toolName: exec.name, callId: exec.callId, label: 'result' },
    suggestedName,
    content,
  }
  try {
    return await spillStore.saveText(save)
  } catch (error) {
    ctx.logger.warn(`tool-fs-search: saveText failed for ${exec.name}: ${String(error)}; complete result not saved`)
    return undefined
  }
}
