import { sep } from 'node:path'
import { defineTool } from '@freddie/freddie-tools'
import { runRipgrep, toWorkdirRelative, trySaveFormattedResult } from './search-core.js'
import { globSearchMeta, searchViewFromMeta } from './presentation.js'
import { acceptedDirectCallValue } from './direct-call.js'

export const GLOB_MAX_RESULTS = 100

export const GLOB_VCS_EXCLUDES = ['.git', '.svn', '.hg', '.bzr', '.jj', '.sl']



export function parseGlobArgs(args) {
  if (args.pattern.trim().length === 0) throw new Error('pattern must be a non-empty string')
  if (args.path !== undefined && args.path.trim().length === 0) throw new Error('path must be a non-empty string when given')
  return { pattern: args.pattern, ...args.path !== undefined ? { path: args.path } : {} }
}

export function buildGlobCommand(input) {
  const parts = [
    '--files',
    `--glob=${input.pattern}`,
    '--sort=modified',
    '--no-ignore',
    '--hidden',
    ...GLOB_VCS_EXCLUDES.flatMap(name => [
      `--glob=!**/${name}`,
      `--glob=!**/${name}/**`,
    ]),
  ]
  if (input.path !== undefined) parts.push('--', input.path)
  return parts
}


function relativeToSearchRoot(path, root) {
  if (root === '.') return path.startsWith(`.${sep}`) ? path.slice(2) : path
  let rootEnd = root.length
  while (rootEnd > 0 && root[rootEnd - 1] === sep) rootEnd -= 1
  const trimmedRoot = root.slice(0, rootEnd)
  if (trimmedRoot.length === 0) return stripLeadingSeparators(path)
  if (path === trimmedRoot) return ''
  if (path.startsWith(`${trimmedRoot}${sep}`)) {
    return path.slice(trimmedRoot.length + 1)
  }
  return path
}

function stripLeadingSeparators(path) {
  let start = 0
  while (path[start] === sep) start += 1
  return path.slice(start)
}

function topLevelSegment(path) {
  const trimmed = stripLeadingSeparators(path)
  const cut = trimmed.indexOf(sep)
  return cut === -1 ? trimmed : trimmed.slice(0, cut)
}

export function sampleAcrossTopLevel(paths, maxItems, root = '.') {
  const groups = new Map()
  let active = []
  for (const path of paths) {
    const key = topLevelSegment(relativeToSearchRoot(path, root))
    const group = groups.get(key)
    if (group === undefined) {
      const items = [path]
      groups.set(key, items)
      active.push({ key, items, index: 0, current: path })
    } else {
      group.push(path)
    }
  }
  const taken = new Map()
  let count = 0
  while (active.length > 0 && count < maxItems) {
    const nextActive = []
    for (const { key, items, index, current } of active) {
      if (count >= maxItems) break
      count += 1
      const bucket = taken.get(key)
      if (bucket === undefined) taken.set(key, [current])
      else bucket.push(current)
      const nextIndex = index + 1
      const nextPath = items[nextIndex]
      if (nextPath !== undefined) nextActive.push({ key, items, index: nextIndex, current: nextPath })
    }
    active = nextActive
  }
  return { items: [...taken.values()].flat(), shown: taken.size, total: groups.size }
}

export function formatGlobOutput(sample, seen, spillRef) {
  const basis = sample.total === seen
    ? '.'
    : `, sampled across ${sample.shown} of the ${sample.total} top-level entries this pattern matched instead of taken in modification-time order.`
      + (sample.shown < sample.total ? ' Narrow path to inspect a specific subtree.' : '')
  return formatGlobPage(sample.items, seen, spillRef, basis)
}

function formatGlobPage(items, seen, spillRef, basis) {
  const body = items.join('\n')
  const recovery = spillRef !== undefined
    ? `Full sorted result stored at: ${spillRef.locator}. ${spillRef.retrievalHint}`
    : 'The complete result could not be saved; narrow pattern or path to see more.'
  return `${body}\n\n(Showing ${items.length} of ${seen} paths${basis} ${recovery})`
}

function renderGlobPaths(paths, caps, root, spillRef) {
  if (paths.length === 0) return 'No files found'
  if (paths.length <= caps.maxResults) return paths.join('\n')
  if (!caps.sampleOverCapGlobResults) {
    return formatGlobPage(paths.slice(0, caps.maxResults), paths.length, spillRef, '.')
  }
  return formatGlobOutput(sampleAcrossTopLevel(paths, caps.maxResults, root), paths.length, spillRef)
}

function globCardPage(paths, caps, root) {
  if (paths.length <= caps.maxResults) return { items: paths, truncated: false }
  if (!caps.sampleOverCapGlobResults) return { items: paths.slice(0, caps.maxResults), truncated: true }
  return { items: sampleAcrossTopLevel(paths, caps.maxResults, root).items, truncated: true }
}

export function presentGlobCall(args) {
  const where = args.path !== undefined ? ` in ${args.path}` : ''
  return { card: 'generic', title: `Glob ${args.pattern}${where}`, kind: 'search', rawInput: args.pattern }
}

export function presentGlobResult(_args, result) {
  if (result.isError) return undefined
  const view = searchViewFromMeta(result.meta)
  if (view === undefined || view.shape !== 'paths') return undefined
  return view
}

export function applyGlobTool(ctx, caps) {
  const overCapGuidance = caps.sampleOverCapGlobResults
    ? 'while a larger one is sampled across top-level entries, so it spans the tree instead of one subtree.'
    : 'while a larger one keeps the modification-time-ordered head.'
  ctx.systemPrompt.section({
    name: 'tool:glob',
    order: 103,
    text: 'Use the glob tool — not shell find — to discover files by path pattern. A pattern with no "/" matches basenames at any depth, so "*" matches every file in the tree rather than its top level. '
      + `Results are files only, never directories, and include hidden and ignored files: a result that fits comes back in modification-time order, ${overCapGuidance}`,
  })

  const overCapDescription = caps.sampleOverCapGlobResults
    ? `a larger result instead returns ${caps.maxResults} paths sampled across top-level entries`
    : `a larger result returns the first ${caps.maxResults} paths in modification-time order`
  const tool = defineTool({
    name: 'glob',
    description: 'Find files whose paths match a glob pattern. Returns matching file paths — never directories — '
      + 'including hidden and ignored files (VCS metadata directories are excluded). '
      + `Up to ${caps.maxResults} paths come back in modification-time order; ${overCapDescription}, `
      + 'says so, and reports where the complete sorted list was saved. This tool does not enumerate directory entries.',
    parameters: {
      pattern: {
        type: 'string',
        required: true,
        description: 'Glob pattern to match file paths against (e.g. "**/*.ts", "src/**/*.test.js"). '
          + 'A pattern with no "/" matches the basename at any depth, so "*" and "*.ts" both search the whole tree; include a separator to anchor the depth.',
      },
      path: { type: 'string', description: 'Directory to search in. Defaults to the session workspace; a relative path resolves against it.' },
    },
    timeoutMs: caps.timeoutMs,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          paths: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderGlobPaths(value.paths, caps, value.root) }],
      presentationMeta: (_args, value) => {
        const page = globCardPage(value.paths, caps, value.root)
        return globSearchMeta({ items: page.items, truncated: page.truncated, seen: value.paths.length }, caps.maxMetaBytes)
      },
    },
    async execute(args, exec) {
      const input = parseGlobArgs(args)
      const run = await runRipgrep(ctx, exec, 'glob', buildGlobCommand(input), caps.rawOutputMaxBytes, caps.graceMs, caps.stderrMaxBytes)
      const root = input.path === undefined ? '.' : toWorkdirRelative(input.path, run.workdir)
      if (run.noMatches) return { root, paths: [] }

      const all = []
      for (const line of run.stdout.split('\n')) {
        if (line.length === 0) continue
        const displayPath = toWorkdirRelative(line, run.workdir)
        all.push(displayPath)
      }
      return { root, paths: all }
    },
    presentCall: presentGlobCall,
    presentResult: presentGlobResult,
  })
  ctx.tools.register(tool)

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    const value = acceptedDirectCallValue(ctx, tool, exec, result, decision)
    if (value === undefined) return decision
    const paths = value.paths
    if (paths.length <= caps.maxResults) return decision
    const spillRef = await trySaveFormattedResult(ctx, exec, 'glob-results.txt', paths.join('\n'))
    return {
      kind: 'accept',
      content: [{ type: 'text', text: renderGlobPaths(paths, caps, value.root, spillRef) }],
      ...decision.additionalContexts !== undefined ? { additionalContexts: decision.additionalContexts } : {},
    }
  })
}
