
import { createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { normalizeUri } from 'micromark-util-sanitize-uri'
import { renderCodeBlock } from './CodeBlock.js'
import { renderTexToVNodes } from './katex.js'
import css from './MarkdownText.css.js'

const WIDE_TABLE_MIN_COLUMNS = 4
const HTTP_URL_PREFIX = /^https?:\/\//i

function sanitizeUrl(url) {
  try {
    switch (new URL(url).protocol) {
      case 'http:':
      case 'https:':
      case 'mailto:':
        return url
      default:
        return ''
    }
  } catch {
    return ''
  }
}

function remoteImageUrl(url) {
  try {
    const protocol = new URL(url).protocol
    return protocol === 'http:' || protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}


export function createReferenceTargets() {
  return { definitions: new Map(), footnotes: new Map() }
}

export function collectReferenceTargets(nodes, targets) {
  for (const node of nodes) {
    if (node.type === 'definition') {
      const id = node.identifier.toUpperCase()
      if (!targets.definitions.has(id)) targets.definitions.set(id, node)
    } else if (node.type === 'footnoteDefinition') {
      const id = node.identifier.toUpperCase()
      if (!targets.footnotes.has(id)) targets.footnotes.set(id, node)
    }
    if ('children' in node) collectReferenceTargets(node.children, targets)
  }
}

export function renderBlocks(blocks, context) {
  return blocks
    .map(block => renderNode(block.node, block.key, context))
    .filter(element => element !== null)
}

export function wrapBlockChildren(elements, edges) {
  const wrapped = []
  for (const element of elements) {
    if (edges || wrapped.length > 0) wrapped.push('\n')
    wrapped.push(element)
  }
  if (edges && elements.length > 0) wrapped.push('\n')
  return wrapped
}


function renderBlockEntries(blocks, context) {
  const entries = []
  for (const [index, block] of blocks.entries()) {
    if (block.type === 'paragraph') {
      entries.push({ paragraph: renderChildren(block.children, context) })
    } else {
      const element = renderNode(block, index, context)
      if (element !== null) entries.push({ element })
    }
  }
  return entries
}

function renderChildren(nodes, context) {
  return nodes.map((node, index) => renderNode(node, index, context))
}

function renderNode(node, key, context) {
  switch (node.type) {
    case 'text':
      return node.value
    case 'paragraph':
      return h('p', { key }, renderChildren(node.children, context))
    case 'heading':
      return h(`h${node.depth}`, { key }, ...renderChildren(node.children, context))
    case 'blockquote':
      return (
        h(
          'blockquote',
          { key },
          wrapBlockChildren(
            renderChildren(node.children, { ...context, inBlockquote: true }).filter(child => child !== null),
            true,
          ),
        )
      )
    case 'thematicBreak':
      return h('hr', { key })
    case 'break':
      return [h('br', { key }), '\n']
    case 'strong':
      return h('strong', { key }, renderChildren(node.children, context))
    case 'emphasis':
      return h('em', { key }, renderChildren(node.children, context))
    case 'delete':
      return h('del', { key }, renderChildren(node.children, context))
    case 'inlineCode': {
      const value = node.value.replace(/\r?\n|\r/g, ' ')
      const href = inlineCodeHttpUrl(value)
      if (href !== undefined) return h('code', { key }, renderSafeLink(href, [value], 'link'))
      const buttonCannotNestInAnchor = context.inLink === true
      const mention = buttonCannotNestInAnchor ? undefined : context.fileMentions?.resolve(value)
      if (mention !== undefined) {
        return (
          h(
            'code',
            { key },
            h(
              'button',
              {
                type: 'button',
                class: css.fileMention ?? '',
                title: mention.title,
                'aria-label': mention.label,
                onclick: mention.open,
              },
              value,
            ),
          )
        )
      }
      return h('code', { key }, value)
    }
    case 'html':
      return node.value
    case 'code':
      return renderCode(node, key, context)
    case 'math':
      return renderTexToVNodes(node.value, true)
    case 'inlineMath':
      return renderTexToVNodes(node.value, false)
    case 'list':
      return renderList(node, key, context)
    case 'listItem':
      return renderListItem(node, listItemLoose(node), key, context)
    case 'table':
      return renderTable(node, key, context)
    case 'link':
      return renderAnchor(node.url, renderChildren(node.children, { ...context, inLink: true }), key)
    case 'linkReference':
      return renderLinkReference(node, key, context)
    case 'image':
      return renderImage(node.url, node.alt ?? '', key)
    case 'imageReference':
      return renderImageReference(node, key, context)
    case 'footnoteReference':
      return renderFootnoteReference(node, key, context)
    case 'definition':
    case 'footnoteDefinition':
      return null
    default:
      return null
  }
}

function renderCode(node, key, context) {
  const language = node.lang ?? undefined
  if (node.value === '') {
    return (
      h(
        'pre',
        { key },
        h('code', { class: language === undefined ? '' : `language-${language}` }),
      )
    )
  }
  const lang = language === undefined ? undefined : /^[\w-]+/.exec(language)?.[0]
  if (!context.streaming && lang === 'math') {
    return renderTexToVNodes(`${node.value}\n`, true)
  }
  const props = {
    code: `${node.value}\n`,
    lang: context.streaming ? undefined : lang,
    copyLabel: context.codeLabels?.copyLabel,
    copiedLabel: context.codeLabels?.copiedLabel,
  }
  return (
    h('freddie-code-block', {
      key: key,
      ref: (el) => { renderCodeBlock(el, props) },
    })
  )
}

function listLoose(list) {
  return (list.spread ?? false) || list.children.some(listItemLoose)
}

function listItemLoose(item) {
  return item.spread ?? item.children.length > 1
}

function renderList(node, key, context) {
  const loose = listLoose(node)
  const properties = {}
  if (typeof node.start === 'number' && node.start !== 1) properties.start = node.start
  if (node.children.some(item => typeof item.checked === 'boolean')) {
    properties.class = 'contains-task-list'
  }
  return h(
    node.ordered === true ? 'ol' : 'ul',
    { key, ...properties },
    ...node.children.map((item, index) => renderListItem(item, loose, index, context)),
  )
}

function renderListItem(item, loose, key, context) {
  const entries = renderBlockEntries(item.children, context)
  const task = typeof item.checked === 'boolean'
  if (task) {
    const checkbox = h('input', { key: 'task-checkbox', type: 'checkbox', checked: item.checked === true, disabled: true })
    const head = entries[0]
    if (head !== undefined && 'paragraph' in head) {
      head.paragraph = head.paragraph.length > 0 ? [checkbox, ' ', ...head.paragraph] : [checkbox]
    } else {
      entries.unshift({ paragraph: [checkbox] })
    }
  }
  const parts = []
  for (const [index, entry] of entries.entries()) {
    const isParagraph = 'paragraph' in entry
    if (loose || index !== 0 || !isParagraph) parts.push('\n')
    if (!isParagraph) parts.push(entry.element)
    else if (loose) parts.push(h('p', { key: `p-${index}` }, entry.paragraph))
    else parts.push(entry.paragraph)
  }
  const tail = entries[entries.length - 1]
  if (tail !== undefined && (loose || !('paragraph' in tail))) parts.push('\n')
  return (
    h('li', { key, class: task ? 'task-list-item' : '' }, parts)
  )
}

function renderTable(node, key, context) {
  const align = node.align ?? null
  const [headRow, ...bodyRows] = node.children
  const columns = align === null ? headRow?.children.length ?? 0 : align.length
  const wide = columns >= WIDE_TABLE_MIN_COLUMNS && context.inBlockquote !== true
  return (
    h(
      'div',
      {
        key,
        class: clsx(css.tableScroll, wide ? 'md-table-wide' : css.tableFill),
        tabindex: wide ? 0 : undefined,
      },
      h(
        'table',
        null,
        headRow !== undefined && h('thead', null, renderTableRow(headRow, 'th', align, 0, context)),
        bodyRows.length > 0 && (
          h(
            'tbody',
            null,
            bodyRows.map((row, index) => renderTableRow(row, 'td', align, index + 1, context)),
          )
        ),
      ),
    )
  )
}

function renderTableRow(row, cellTag, align, key, context) {
  const cellCount = align === null ? row.children.length : align.length
  const cells = []
  for (let index = 0; index < cellCount; index++) {
    const cell = row.children[index]
    const alignValue = align?.[index]
    cells.push(h(
      cellTag,
      { key: index, style: alignValue == null ? undefined : `text-align: ${alignValue}` },
      ...(cell === undefined ? [] : renderChildren(cell.children, context)),
    ))
  }
  return h('tr', { key }, cells)
}

function renderSafeLink(href, children, key) {
  const safeHref = sanitizeUrl(href)
  if (safeHref === '') return children
  const external = ['http:', 'https:'].includes(new URL(safeHref).protocol)
  return (
    h(
      'a',
      { key, href: safeHref, ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}) },
      children,
    )
  )
}

function renderAnchor(url, children, key) {
  return renderSafeLink(normalizeUri(url), children, key)
}

function inlineCodeHttpUrl(value) {
  if (value.trim() !== value) return undefined
  if (!HTTP_URL_PREFIX.test(value)) return undefined
  try {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:' ? value : undefined
  } catch {
    return undefined
  }
}

function renderImage(url, alt, key) {
  const imageSrc = remoteImageUrl(sanitizeUrl(normalizeUri(url)))
  if (imageSrc === undefined) {
    return h('span', { key, class: css.imageAlt ?? '' }, alt)
  }
  return (
    h('img', {
      key,
      class: css.image ?? '',
      src: imageSrc,
      alt: alt,
      loading: 'lazy',
      decoding: 'async',
      referrerpolicy: 'no-referrer',
    })
  )
}

function referenceSuffix(node) {
  if (node.referenceType === 'collapsed') return '][]'
  if (node.referenceType === 'full') return `][${node.label ?? node.identifier}]`
  return ']'
}

function renderLinkReference(node, key, context) {
  const definition = context.targets.definitions.get(node.identifier.toUpperCase())
  if (definition === undefined) {
    return ['[', renderChildren(node.children, context), referenceSuffix(node)]
  }
  return renderAnchor(definition.url, renderChildren(node.children, { ...context, inLink: true }), key)
}

function renderImageReference(node, key, context) {
  const definition = context.targets.definitions.get(node.identifier.toUpperCase())
  if (definition === undefined) return `![${node.alt ?? ''}${referenceSuffix(node)}`
  return renderImage(definition.url, node.alt ?? '', key)
}

function renderFootnoteReference(node, key, context) {
  const id = node.identifier.toUpperCase()
  const seen = context.footnoteCounts.get(id)
  if (seen === undefined) context.footnoteOrder.push(id)
  context.footnoteCounts.set(id, (seen ?? 0) + 1)
  return h('sup', { key }, String(context.footnoteOrder.indexOf(id) + 1))
}

export function renderFootnoteSection(context) {
  const items = []
  for (const id of context.footnoteOrder) {
    const definition = context.targets.footnotes.get(id)
    if (definition === undefined) continue
    const count = context.footnoteCounts.get(id) ?? 0
    const backrefs = []
    for (let reference = 1; reference <= count; reference++) {
      if (backrefs.length > 0) backrefs.push(' ')
      backrefs.push('↩')
      if (reference > 1) backrefs.push(h('sup', { key: `re-${reference}` }, String(reference)))
    }
    const entries = renderBlockEntries(definition.children, context)
    const tail = entries[entries.length - 1]
    const body = entries.map((entry, index) => (
      'paragraph' in entry
        ? (
          h(
            'p',
            { key: `p-${index}` },
            entry.paragraph,
            entry === tail && [' ', backrefs],
          )
        )
        : entry.element
    ))
    if (tail === undefined || !('paragraph' in tail)) body.push(...backrefs)
    items.push(
      h(
        'li',
        { key: id, id: `user-content-fn-${normalizeUri(id.toLowerCase())}` },
        wrapBlockChildren(body, true),
      ),
    )
  }
  if (items.length === 0) return null
  return (
    h(
      'section',
      { key: 'footnotes', 'data-footnotes': '', class: 'footnotes' },
      h('h2', { id: 'footnote-label', class: 'sr-only' }, 'Footnotes'),
      h('ol', null, items),
    )
  )
}
