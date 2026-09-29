/**
 * Parse Claude Code's event-to-matcher-group hook format into shared `MatcherGroup`s.
 * Only command hooks run; other hook types are returned as skipped so the
 * bridge can warn. Plugin-root and project-directory substitutions are applied
 * to commands at parse time.
 *
 * @typedef {import('@freddie/freddie-hook-protocol').MatcherGroup} MatcherGroup
 * @typedef {Record<string, MatcherGroup[]>} ClaudeCodeHookConfig A parsed CC config: event name → its matcher groups (command hooks only).
 * @typedef {{ event: string; type: string }} SkippedHook A skipped non-command hook, surfaced so the bridge can warn about it.
 * @typedef {{ config: ClaudeCodeHookConfig; skipped: SkippedHook[] }} ParsedClaudeConfig The outcome of parsing one config file.
 * @typedef {{ pluginRoot?: string; projectDir?: string }} SubstitutionVars
 *   Substitution variables applied to each `command` string at parse time. `pluginRoot` replaces
 *   `${CLAUDE_PLUGIN_ROOT}`; `projectDir` replaces `${CLAUDE_PROJECT_DIR}`.
 */

import { matcherDiagnostic } from '@freddie/freddie-hook-protocol'

const CLAUDE_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SubagentStart',
  'SubagentStop',
]

/** A plain (non-null, non-array) object, else undefined. */
function asObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
}

/**
 * Apply `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PROJECT_DIR}` substitution to a command string.
 * @param {string} command - the raw command from config.
 * @param {SubstitutionVars} vars - the substitution values; a token whose variable is unset stays verbatim.
 * @returns {string} the command with every occurrence of each set token replaced.
 */
export function substituteCommand(command, vars) {
  let out = command
  if (vars.pluginRoot !== undefined) out = out.split('${CLAUDE_PLUGIN_ROOT}').join(vars.pluginRoot)
  if (vars.projectDir !== undefined) out = out.split('${CLAUDE_PROJECT_DIR}').join(vars.projectDir)
  return out
}

/**
 * Parse either a settings `hooks` value or a bare `hooks.json` event map. Malformed entries are
 * ignored rather than failing boot; unsupported events are ignored before their groups are parsed,
 * non-command hooks are returned in `skipped`, and substitutions are applied to every surviving
 * command. Matcher fields on UserPromptSubmit and Stop are discarded because those events have no
 * matcher subject. A matcher-bearing supported runnable group with an invalid regex throws a
 * `SyntaxError`, allowing the bridge to reject the complete config before listener registration.
 *
 * @param {unknown} raw - the parsed JSON config: a settings object with a `hooks` key, or the bare event map.
 * @param {SubstitutionVars} [vars] - substitution values applied to every surviving `command` (defaults to none).
 * @returns {ParsedClaudeConfig} the runnable per-event groups plus the skipped non-command hooks.
 */
export function parseClaudeCodeConfig(raw, vars = {}) {
  const config = {}
  const skipped = []
  const root = asObject(raw)
  const hooksMap = root ? asObject(root.hooks) ?? root : undefined
  if (!hooksMap) return { config, skipped }

  for (const event of CLAUDE_EVENTS) {
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
        if (type !== 'command') {
          skipped.push({ event, type })
          continue
        }
        if (typeof hook.command !== 'string') continue
        commands.push({
          command: substituteCommand(hook.command, vars),
          ...typeof hook.timeout === 'number' ? { timeoutSec: hook.timeout } : {},
        })
      }
      if (commands.length === 0) continue
      const matcher = event === 'UserPromptSubmit' || event === 'Stop'
        ? undefined
        : typeof group.matcher === 'string' ? group.matcher : undefined
      const diagnostic = matcherDiagnostic(matcher, 'claude-code')
      if (diagnostic !== undefined) throw new SyntaxError(`${diagnostic} on event ${JSON.stringify(event)}`)
      groups.push({
        ...matcher !== undefined ? { matcher } : {},
        hooks: commands,
      })
    }
    if (groups.length > 0) config[event] = groups
  }

  return { config, skipped }
}
