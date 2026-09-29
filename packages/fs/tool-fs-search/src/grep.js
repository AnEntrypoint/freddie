import { defineTool } from '@freddie/freddie-tools'
import { SearchError, previewLine, retainGrepMatches, runRipgrep, toWorkdirRelative, trySaveFormattedResult } from './search-core.js'
import { grepSearchMeta, searchViewFromMeta } from './presentation.js'
import { acceptedDirectCallValue } from './direct-call.js'

export const GREP_MAX_MATCHES = 250

export const GREP_MAX_LINE_BYTES = 2000



function validateInclude(include) {
  if (include.trim().length === 0) throw new Error('include must be a non-empty glob when given')
  if (include.startsWith('!')) throw new Error('include must be a positive glob filter; negated patterns ("!…") are not supported')
  let braceDepth = 0
  for (const char of include) {
    if (char === '{') braceDepth++
    else if (char === '}') braceDepth = Math.max(0, braceDepth - 1)
    else if (char === ',' && braceDepth === 0) {
      throw new Error('include must be one glob, not a comma-separated list (use {a,b} alternation instead)')
    }
  }
}

export function parseGrepArgs(args) {
  if (args.pattern.length === 0) throw new Error('pattern must be a non-empty string')
  if (args.path !== undefined && args.path.trim().length === 0) throw new Error('path must be a non-empty string when given')
  if (args.include !== undefined) validateInclude(args.include)
  return {
    pattern: args.pattern,
    ...args.path !== undefined ? { path: args.path } : {},
    ...args.include !== undefined ? { include: args.include } : {},
  }
}

export function buildGrepCommand(input) {
  const parts = ['--json', `--regexp=${input.pattern}`]
  if (input.include !== undefined) parts.push(`--glob=${input.include}`)
  if (input.path !== undefined) parts.push('--', input.path)
  return parts
}

function malformedRecord(detail, cause) {
  return new SearchError(`grep received malformed ripgrep --json output (${detail})`, 'SEARCH_FAILED', cause !== undefined ? { cause } : undefined)
}

function parseRecord(line) {
  let parsed
  try {
    parsed = JSON.parse(line)
  } catch (error) {
    throw malformedRecord('a line is not JSON', error)
  }
  if (typeof parsed !== 'object' || parsed === null) throw malformedRecord('a record is not an object')
  const record = parsed
  if (record.type !== 'match') return undefined
  if (typeof record.data !== 'object' || record.data === null) throw malformedRecord('a match record has no data')
  const data = record.data
  const pathText = typeof data.path === 'object' && data.path !== null ? data.path.text : undefined
  if (typeof pathText !== 'string') throw malformedRecord('a match record has no path text')
  if (typeof data.line_number !== 'number') throw malformedRecord('a match record has no line number')
  if (typeof data.lines !== 'object' || data.lines === null) throw malformedRecord('a match record has no line content')
  const lines = data.lines
  if (typeof lines.text === 'string') {
    return { path: pathText, lineNumber: data.line_number, line: lines.text.replace(/\r?\n$/, '') }
  }
  if (typeof lines.bytes === 'string') {
    return { path: pathText, lineNumber: data.line_number, line: '(line is not valid UTF-8)' }
  }
  throw malformedRecord('a match record has neither line text nor bytes')
}

export function parseGrepMatches(stdout) {
  const matches = []
  for (const line of stdout.split('\n')) {
    if (line.length === 0) continue
    const match = parseRecord(line)
    if (match !== undefined) matches.push(match)
  }
  return matches
}

function matchNoun(count) {
  return count === 1 ? 'match' : 'matches'
}

export function formatGrepMatches(matches) {
  const byFile = new Map()
  for (const match of matches) {
    const group = byFile.get(match.path)
    if (group !== undefined) group.push(match)
    else byFile.set(match.path, [match])
  }
  const sections = []
  for (const [path, group] of byFile) {
    sections.push(`${path}\n${group.map(m => `Line ${m.lineNumber}: ${m.line}`).join('\n')}`)
  }
  return sections.join('\n\n')
}

export function formatGrepOutput(retained, spillRef) {
  const header = retained.truncated
    ? `Found ${retained.kept} of ${retained.seen} matches`
    : `Found ${retained.seen} ${matchNoun(retained.seen)}`
  const body = formatGrepMatches(retained.items)
  if (!retained.truncated) return `${header}\n\n${body}`
  const recovery = spillRef !== undefined
    ? `Full grep result stored at: ${spillRef.locator}. ${spillRef.retrievalHint}`
    : 'The complete result could not be saved; narrow pattern, path, or include to see more.'
  return `${header}\n\n${body}\n\n(${recovery})`
}

function formatRetainedGrep(retained, spillRef) {
  if (retained.seen === 0) return 'No matches found'
  return formatGrepOutput(retained, spillRef)
}

export function presentGrepCall(args) {
  const where = args.path !== undefined ? ` in ${args.path}` : ''
  const filter = args.include !== undefined ? ` (${args.include})` : ''
  return { card: 'generic', title: `Grep ${args.pattern}${where}${filter}`, kind: 'search', rawInput: args.pattern }
}

export function presentGrepResult(
  _args,
  result,
) {
  if (result.isError) return undefined
  const view = searchViewFromMeta(result.meta)
  if (view === undefined || view.shape !== 'matches') return undefined
  return view
}

export function applyGrepTool(ctx, caps) {
  ctx.systemPrompt.section({
    name: 'tool:grep',
    order: 104,
    text: 'Use the grep tool — not shell grep or rg — to search file contents. Use read on a matched file when you need surrounding context.',
  })

  const tool = defineTool({
    name: 'grep',
    description: 'Search file contents with a ripgrep regular expression. Returns matching lines with line numbers, grouped by file. '
      + `Returns the first ${caps.maxMatches} matches inline; a capped result reports where the complete match list was saved. `
      + 'Use read on a matched file for surrounding context.',
    parameters: {
      pattern: { type: 'string', required: true, description: 'Regular expression to search for (ripgrep syntax).' },
      path: { type: 'string', description: 'File or directory to search. Defaults to the session workspace; a relative path resolves against it.' },
      include: { type: 'string', description: 'One glob filter for which files to search (e.g. "*.ts", "*.{js,jsx}"). Not a list; negation is not supported.' },
    },
    timeoutMs: caps.timeoutMs,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          matches: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                lineNumber: { type: 'integer', required: true },
                line: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: formatRetainedGrep(retainGrepMatches(value.matches, caps.maxMatches, caps.maxLineBytes)),
      }],
      presentationMeta: (_args, value) =>
        grepSearchMeta(retainGrepMatches(value.matches, caps.maxMatches, caps.maxLineBytes), caps.maxMetaBytes),
    },
    async execute(args, exec) {
      const input = parseGrepArgs(args)
      const run = await runRipgrep(ctx, exec, 'grep', buildGrepCommand(input), caps.rawOutputMaxBytes, caps.graceMs, caps.stderrMaxBytes)
      if (run.noMatches) return { matches: [] }

      const all = []
      for (const raw of parseGrepMatches(run.stdout)) {
        const match = {
          path: toWorkdirRelative(raw.path, run.workdir),
          lineNumber: raw.lineNumber,
          line: raw.line,
        }
        all.push(match)
      }
      return { matches: all }
    },
    presentCall: presentGrepCall,
    presentResult: presentGrepResult,
  })
  ctx.tools.register(tool)

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    const value = acceptedDirectCallValue(ctx, tool, exec, result, decision)
    if (value === undefined) return decision
    const matches = value.matches
    if (matches.length <= caps.maxMatches) return decision
    const previewedAll = matches.map(match => ({ ...match, line: previewLine(match.line, caps.maxLineBytes) }))
    const spillRef = await trySaveFormattedResult(
      ctx,
      exec,
      'grep-results.txt',
      `Found ${matches.length} ${matchNoun(matches.length)}\n\n${formatGrepMatches(previewedAll)}`,
    )
    return {
      kind: 'accept',
      content: [{
        type: 'text',
        text: formatRetainedGrep(retainGrepMatches(matches, caps.maxMatches, caps.maxLineBytes), spillRef),
      }],
      ...decision.additionalContexts !== undefined ? { additionalContexts: decision.additionalContexts } : {},
    }
  })
}
