import { matcherDiagnostic } from '@freddie/freddie-hook-protocol'

export const CODEX_EVENTS = ['PreToolUse', 'PostToolUse', 'SessionStart', 'UserPromptSubmit', 'Stop']

function asObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

export function parseCodexConfig(raw) {
  const config = {}
  const skipped = []
  const root = asObject(raw)
  const hooksMap = root ? asObject(root.hooks) ?? root : undefined
  if (!hooksMap) return { config, skipped }

  for (const event of CODEX_EVENTS) {
    const rawGroups = hooksMap[event]
    if (!Array.isArray(rawGroups)) continue
    const groups = []
    for (const rawGroup of rawGroups) {
      const group = asObject(rawGroup)
      if (!group || !Array.isArray(group.hooks)) continue
      const commands = []
      for (const rawHook of group.hooks) {
        const hook = asObject(rawHook)
        if (!hook) continue
        const type = typeof hook.type === 'string' ? hook.type : 'command'
        if (type !== 'command') { skipped.push({ event, reason: `unsupported "${type}" hook` }); continue }
        if (hook.async === true) { skipped.push({ event, reason: 'async hook' }); continue }
        if (typeof hook.command !== 'string') continue
        const timeout = typeof hook.timeout === 'number' ? hook.timeout
          : typeof hook.timeoutSec === 'number' ? hook.timeoutSec : undefined
        commands.push({ command: hook.command, ...timeout !== undefined ? { timeoutSec: timeout } : {} })
      }
      if (commands.length === 0) continue
      const matcher = event === 'UserPromptSubmit' || event === 'Stop'
        ? undefined
        : typeof group.matcher === 'string' ? group.matcher : undefined
      const diagnostic = matcherDiagnostic(matcher, 'codex')
      if (diagnostic !== undefined) throw new SyntaxError(`${diagnostic} on event ${JSON.stringify(event)}`)
      groups.push({ ...matcher !== undefined ? { matcher } : {}, hooks: commands })
    }
    if (groups.length > 0) config[event] = groups
  }

  return { config, skipped }
}
