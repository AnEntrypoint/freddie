import { resolveWorkspacePath } from '@freddie/freddie-client-runtime/client'

export function terminalBlockLabels(t) {
  return {
    signal: signal => t('terminal.signal', { signal }),
    exitCode: code => t('terminal.exitCode', { code }),
    running: t('terminal.running'),
    failed: t('terminal.failed'),
    done: t('terminal.done'),
    copy: t('copy'),
    copied: t('copied'),
    noOutput: t('terminal.noOutput'),
    collapseAria: t('terminal.collapseAria'),
    collapse: t('collapse'),
    expandAria: hidden => t('terminal.expandAria', { n: hidden }),
    expand: hidden => t('terminal.expandRest', { n: hidden }),
  }
}

export function terminalFailed(model) {
  const { exitCode, signal, running } = model.card
  return running !== true && ((exitCode !== undefined && exitCode !== 0) || signal !== undefined)
}

function resolveTerminalCwd(viewCwd, sessionCwd) {
  if (viewCwd === undefined || viewCwd === '') return sessionCwd
  if (sessionCwd === undefined || sessionCwd === '') return normalizeSegments(viewCwd)
  return normalizeSegments(resolveWorkspacePath(sessionCwd, viewCwd))
}

function normalizeSegments(path) {
  if (!/(?:^|[/\\])\.\.?(?:[/\\]|$)/.test(path)) return path
  const unc = /^[/\\]{2}([^/\\]+)[/\\]+([^/\\]+)/.exec(path)
  if (unc !== null) {
    const [matched, server, share] = unc
    const root = `\\\\${String(server)}\\${String(share)}`
    const rest = collapse(path.slice(matched.length), true)
    return rest === '' ? root : `${root}\\${rest}`
  }
  const backslashed = path.includes('\\') && !path.includes('/')
  const separator = backslashed ? '\\' : '/'
  const rooted = /^[/\\]/.test(path)
  const drive = /^[A-Za-z]:/.exec(path)?.[0] ?? ''
  const body = collapse(path.slice(drive.length), rooted || drive !== '', separator)
  const leading = rooted ? separator : ''
  return drive === '' ? `${leading}${body}` : `${drive}${rooted ? leading : separator}${body}`
}

function collapse(body, rooted, separator = '/') {
  const kept = []
  for (const segment of body.split(/[/\\]/)) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (kept.length > 0 && kept[kept.length - 1] !== '..') kept.pop()
      else if (!rooted) kept.push(segment)
      continue
    }
    kept.push(segment)
  }
  return kept.join(separator)
}

export function terminalCardModel(block, sessionCwd) {
  const call = block.callView?.card === 'terminal' ? block.callView : null
  if (!('kind' in block)) {
    return call === null ? null : {
      description: call.description,
      card: {
        command: call.title,
        cwd: resolveTerminalCwd(call.cwd, sessionCwd),
        output: undefined,
        exitCode: undefined,
        signal: undefined,
        running: true,
      },
    }
  }
  const result = block.resultView?.card === 'terminal' ? block.resultView : null
  if (result === null) return null
  return {
    description: call?.description,
    card: {
      command: result.title ?? call?.title ?? '',
      cwd: call === null ? undefined : resolveTerminalCwd(call.cwd, sessionCwd),
      output: result.output,
      exitCode: result.exitCode,
      signal: result.signal,
      running: false,
    },
  }
}
