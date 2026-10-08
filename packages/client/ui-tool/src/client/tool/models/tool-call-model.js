import { abbreviateHomePath } from '@freddie/freddie-client-runtime/client'

export const VARIANT_TITLES = {
  search: 'Search', read: 'Read', bash: 'Bash',
  write: 'Write', edit: 'Edit', code: 'Code', others: 'Tool call',
}

const TOOL_VARIANTS = {
  bash: 'bash',
  pwsh: 'bash',
  read: 'read',
  web_fetch: 'read',
  web_search: 'search',
  grep: 'search',
  glob: 'search',
  lsp: 'search',
  write: 'write',
  edit: 'edit',
  run_code: 'code',
  cordis_package_inspect: 'read',
  cordis_runtime_inspect: 'read',
  cordis_run: 'others',
  cordis_stop: 'others',
  cordis_undefine: 'others',
}

const TOOL_TITLES = {
  cordis_package_inspect: 'Inspect',
  cordis_runtime_inspect: 'Inspect',
  cordis_run: 'Run Cordis Plugin',
  cordis_stop: 'Stop Cordis Plugin',
  cordis_undefine: 'Remove Cordis Plugin',
  pwsh: 'Pwsh',
}

export function classifyTool(toolName) {
  return TOOL_VARIANTS[toolName] ?? 'others'
}

export function resultText(node) {
  const parts = []
  for (const block of node.content) {
    if (block.type === 'text') parts.push(block.text)
    else parts.push(JSON.stringify(block, null, 2))
  }
  if (parts.length === 0 && node.error !== undefined) {
    parts.push(`${node.error.name}: ${node.error.code}`)
  }
  return parts.join('\n')
}

let lastArgsRaw
let lastArgsParsed

function parseArgs(argsRaw) {
  if (argsRaw === lastArgsRaw) return lastArgsParsed
  let parsed
  try {
    parsed = JSON.parse(argsRaw)
  } catch {
    parsed = undefined
  }
  lastArgsRaw = argsRaw
  lastArgsParsed = parsed
  return parsed
}

function firstLine(text) {
  const nl = text.indexOf('\n')
  return nl === -1 ? text : text.slice(0, nl)
}

function pickString(args, keys) {
  for (const key of keys) {
    const v = args[key]
    if (typeof v === 'string' && v !== '') return v
  }
  return undefined
}

const SUMMARY_KEYS = {
  bash: ['description', 'command'],
  read: ['path', 'file_path', 'url'],
  search: ['query', 'pattern', 'url'],
  write: ['path', 'file_path'],
  edit: ['path', 'file_path'],
  code: ['description'],
  others: [],
}

export function relativizeToCwd(text, cwd) {
  if (cwd === undefined || cwd === '') return text
  const root = cwd.replace(/[/\\]+$/, '')
  if (text.startsWith(`${root}/`) || text.startsWith(`${root}\\`)) return text.slice(root.length + 1)
  return text
}

function deriveSummary(variant, argsRaw) {
  const parsed = parseArgs(argsRaw)
  if (typeof parsed !== 'object' || parsed === null) return firstLine(argsRaw)
  const args = parsed
  if (variant === 'search' && Array.isArray(args.queries)) {
    const queries = args.queries.filter(query => typeof query === 'string' && query !== '')
    if (queries.length > 0) return queries.map(firstLine).join(', ')
  }
  const picked = pickString(args, SUMMARY_KEYS[variant])
  if (picked !== undefined) return firstLine(picked)
  for (const v of Object.values(args)) {
    if (typeof v === 'string' && v !== '') return firstLine(v)
  }
  return firstLine(argsRaw)
}

const FILE_PATH_KEYS = ['path', 'file_path']

const FILE_PATH_VARIANTS = new Set(['read', 'write', 'edit'])

function deriveFilePath(variant, argsRaw) {
  if (!FILE_PATH_VARIANTS.has(variant)) return undefined
  const parsed = parseArgs(argsRaw)
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const picked = pickString(parsed, FILE_PATH_KEYS)
  return picked === undefined ? undefined : firstLine(picked)
}

function deriveBody(variant, argsRaw) {
  if (argsRaw === '') return null
  const parsed = parseArgs(argsRaw)
  if (parsed === undefined) return argsRaw
  if (variant === 'code' && typeof parsed === 'object' && parsed !== null) {
    const code = parsed.code
    if (typeof code === 'string' && code !== '') return code
  }
  return JSON.stringify(parsed, null, 2)
}

export function toolRowModel(toolName, block, cwd, home) {
  const variant = classifyTool(toolName)
  const done = 'kind' in block
  const argsRaw = (done ? block.call?.argsRaw : block.argsRaw) ?? ''
  const state = !done ? 'running'
    : block.error?.code === 'interrupted' ? 'stopped'
      : block.isError ? 'error' : 'ok'
  const base = argsRaw === ''
    ? block.callId
    : abbreviateHomePath(relativizeToCwd(deriveSummary(variant, argsRaw), cwd), home)
  const toolTitle = TOOL_TITLES[toolName]
  const resultTitle = done && block.resultView?.card === 'generic'
    && typeof block.resultView.title === 'string' && block.resultView.title !== ''
    ? block.resultView.title
    : undefined
  const summary = resultTitle ?? (variant === 'others' && toolName !== '' && toolTitle === undefined
    ? `${toolName} · ${base}`
    : base)
  const output = done ? (resultText(block) || null) : null
  const errorSummary = state === 'error' && output !== null ? firstLine(output) : null
  return {
    variant,
    title: toolTitle ?? VARIANT_TITLES[variant],
    summary,
    resultTitle,
    filePath: deriveFilePath(variant, argsRaw),
    body: deriveBody(variant, argsRaw),
    output,
    errorSummary,
    state,
  }
}
