import TurndownService from 'turndown'
import { gfm } from '@joplin/turndown-plugin-gfm'
import { defineTool } from '@freddie/freddie-tools'
import { assertNever } from '@freddie/freddie-llm'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})
turndown.use(gfm)
turndown.remove(['script', 'style', 'noscript'])

function renderTableCell(content, index) {
  const prefix = index === 0 ? '| ' : ' '
  const escaped = content.trim().replace(/\n\r/g, '<br>').replace(/\n/g, '<br>').replace(/\|+/g, '\\|').padEnd(3, ' ')
  return `${prefix}${escaped} |`
}

function isTableHeadingRow(row) {
  const cells = Array.from(row.cells)
  const section = row.parentElement
  const table = section.parentElement
  return (section.nodeName === 'THEAD' || table.rows[0] === row)
    && cells.every(cell => cell.nodeName === 'TH')
}

function tableBorder(cell) {
  const alignment = (cell.getAttribute('align') || cell.style.textAlign || '').toLowerCase()
  if (alignment === 'left') return ':---'
  if (alignment === 'right') return '---:'
  if (alignment === 'center') return ':---:'
  return '---'
}

turndown.addRule('tableCellWithoutSpanExpansion', {
  filter: ['th', 'td'],
  replacement(content, node) {
    const cell = node
    const row = cell.parentNode
    return renderTableCell(content, Array.prototype.indexOf.call(row.childNodes, cell))
  },
})
turndown.addRule('tableRowWithoutSpanExpansion', {
  filter: 'tr',
  replacement(content, node) {
    const row = node
    const border = isTableHeadingRow(row)
      ? Array.from(row.cells, (cell, index) => renderTableCell(tableBorder(cell), index)).join('')
      : ''
    return `\n${content}${border.length > 0 ? `\n${border}` : ''}`
  },
})

export function parseFetchArgs(args) {
  if (args.url.trim().length === 0) throw new Error('url must be a non-empty string')
  return { url: args.url }
}

const MAX_CONVERSION_DEPTH = 512

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'noscript'])

function isTagBoundary(char) {
  return char === undefined || char === '>' || char === '/' || /\s/.test(char)
}

function findRawTextEnd(lowerHtml, name, from) {
  const prefix = `</${name}`
  let candidate = lowerHtml.indexOf(prefix, from)
  while (candidate !== -1 && !isTagBoundary(lowerHtml[candidate + prefix.length])) {
    candidate = lowerHtml.indexOf(prefix, candidate + prefix.length)
  }
  return candidate
}

function exceedsConversionDepth(html) {
  const lowerHtml = html.toLowerCase()
  const openElements = []
  let offset = 0
  let inComment = false

  while (offset < html.length) {
    const start = html.indexOf('<', offset)
    if (inComment) {
      const end = html.indexOf('-->', offset)
      if (end !== -1 && (start === -1 || end < start)) {
        inComment = false
        offset = end + 3
        continue
      }
    }
    if (start === -1) break
    if (!inComment && html.startsWith('<!--', start)) {
      inComment = true
      offset = start + 4
      continue
    }

    let cursor = start + 1
    const closing = html[cursor] === '/'
    if (closing) cursor += 1
    const nameStart = cursor
    while (/[a-zA-Z0-9-]/.test(html[cursor] ?? '')) cursor += 1
    if (cursor === nameStart || !/[a-zA-Z]/.test(html.charAt(nameStart))) {
      offset = start + 1
      continue
    }

    const name = lowerHtml.slice(nameStart, cursor)
    let quote
    while (cursor < html.length) {
      const char = html[cursor]
      cursor += 1
      if (quote !== undefined) {
        if (char === quote) quote = undefined
      } else if (char === '"' || char === "'") {
        quote = char
      } else if (char === '>') {
        break
      }
    }
    if (html[cursor - 1] !== '>') break

    if (closing) {
      if (!inComment && openElements.at(-1) === name) openElements.pop()
    } else {
      let last = cursor - 2
      while (/\s/.test(html.charAt(last))) last -= 1
      if (!VOID_ELEMENTS.has(name) && html[last] !== '/') {
        openElements.push(name)
        if (openElements.length > MAX_CONVERSION_DEPTH) return true
        if (!inComment && RAW_TEXT_ELEMENTS.has(name)) {
          const end = findRawTextEnd(lowerHtml, name, cursor)
          if (end === -1) break
          offset = end
          continue
        }
      }
    }
    offset = cursor
  }
  return false
}

function renderBody(body, maxInputChars) {
  const content = body.content.slice(0, maxInputChars)
  const sourceTruncated = content.length !== body.content.length
  switch (body.kind) {
    case 'html':
      if (exceedsConversionDepth(content)) return { text: content, sourceTruncated }
      try {
        return { text: turndown.turndown(content), sourceTruncated }
      } catch {
        return { text: content, sourceTruncated }
      }
    case 'text':
      return { text: content, sourceTruncated }
    /* v8 ignore next 2 -- WebFetchBody is a closed union; this arm is unreachable and only makes adding a kind a compile error. */
    default:
      return assertNever(body, 'unhandled web fetch body kind')
  }
}

const TRUNCATION_FOOTER = '\n\n(Content truncated. Fetch a more specific URL or section for the full text.)'

/**
 * The bounded model-facing render of one fetch result: complete text and
 * whether the provider, a source cut, or the output cap truncated it.
 * @typedef {object} RenderedFetch
 * @property {string} text
 * @property {boolean} truncated
 */

function renderFetchOutput(result, maxOutputChars) {
  const byCap = renderCache.get(result) ?? new Map()
  const cached = byCap.get(maxOutputChars)
  if (cached !== undefined) return cached
  const computed = computeFetchOutput(result, maxOutputChars)
  byCap.set(maxOutputChars, computed)
  renderCache.set(result, byCap)
  return computed
}

const renderCache = new WeakMap()

function computeFetchOutput(result, maxOutputChars) {
  const header = `Fetched ${result.url} (HTTP ${result.statusCode})\n\n`
  const rendered = renderBody(result.body, maxOutputChars)
  const prefix = `${header}${rendered.text}`
  const truncated = result.truncated || rendered.sourceTruncated || prefix.length > maxOutputChars
  const full = `${prefix}${truncated ? TRUNCATION_FOOTER : ''}`
  if (full.length <= maxOutputChars) return { text: full, truncated }
  if (maxOutputChars < TRUNCATION_FOOTER.length) return { text: full.slice(0, maxOutputChars), truncated }
  return { text: `${prefix.slice(0, maxOutputChars - TRUNCATION_FOOTER.length)}${TRUNCATION_FOOTER}`, truncated }
}

export function formatFetchOutput(result, maxOutputChars) {
  return renderFetchOutput(result, maxOutputChars).text
}

export function presentFetchCall(args) {
  return { card: 'generic', title: args.url, kind: 'fetch', rawInput: args.url }
}

/**
 * The `web_fetch` tool's private `tool/result` `meta` payload: the fetch summary
 * a UI cannot recover from the model-facing render text without reparsing its
 * header line. Attached opaquely (as `JsonValue`) on the tool result and
 * persisted with the session log, so `presentResult` reproduces the fetch card
 * on replay. The body itself is already markdown in the result content, so it is
 * not duplicated here. `truncated` is the effective truncation the render text
 * reflects, which a client cannot recompute (it does not know the deployment's
 * `fetchMaxOutputChars`); this is why fetch meta is carried, not derived from the
 * header line (see the web-result-card Agent Note).
 * @typedef {object} WebFetchMeta
 * @property {string} url
 * @property {number} statusCode
 * @property {boolean} truncated - the effective truncation the render text reflects.
 */

export function fetchMetaFromValue(value, maxOutputChars) {
  return { url: value.url, statusCode: value.statusCode, truncated: renderFetchOutput(value, maxOutputChars).truncated }
}

export function fetchMetaFromResult(meta) {
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) return undefined
  const { url, statusCode, truncated } = meta
  if (typeof url !== 'string' || typeof statusCode !== 'number' || typeof truncated !== 'boolean') return undefined
  return { url, statusCode, truncated }
}

export function presentFetchResult(args, result) {
  if (result.isError) return undefined
  const meta = fetchMetaFromResult(result.meta)
  if (meta === undefined) return undefined
  return {
    card: 'web',
    kind: 'fetch',
    title: args.url,
    url: meta.url,
    statusCode: meta.statusCode,
    truncated: meta.truncated,
  }
}

export function applyWebFetchTool(ctx, timeoutMs, maxOutputChars) {
  ctx.systemPrompt.section({
    name: 'tool:web_fetch',
    order: 111,
    text: 'Use the web_fetch tool to retrieve the content of a specific HTTP(S) URL (for example a result from web_search). It returns the page content decoded to text. Cite the URL as a markdown link when you use its content.',
  })

  ctx.tools.register(defineTool({
    name: 'web_fetch',
    description: 'Fetch the content of a specific HTTP(S) URL and return it decoded to text.',
    parameters: {
      url: { type: 'string', required: true, description: 'The HTTP(S) URL to fetch.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string', required: true },
          statusCode: { type: 'integer', required: true },
          body: {
            required: true,
            oneOf: [
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kind: { type: 'string', required: true, const: 'html' },
                  content: { type: 'string', required: true },
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kind: { type: 'string', required: true, const: 'text' },
                  content: { type: 'string', required: true },
                },
              },
            ],
          },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatFetchOutput(value, maxOutputChars) }],
      presentationMeta: (_args, value) => fetchMetaFromValue(value, maxOutputChars),
    },
    timeoutMs,
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const input = parseFetchArgs(args)
      const result = await ctx.web.fetch(
        { url: input.url },
        exec.signal,
      )
      return {
        url: result.url,
        statusCode: result.statusCode,
        body: { kind: result.body.kind, content: result.body.content },
        truncated: result.truncated,
      }
    },
    presentCall: presentFetchCall,
    presentResult: (args, result) => presentFetchResult(args, result),
  }))
}
