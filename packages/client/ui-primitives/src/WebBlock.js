import { createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { MarkdownText } from './markdown/MarkdownText.js'
import css from './WebBlock.css.js'

function renderAnswer(answer, markdownText) {
  return markdownText === undefined ? h(MarkdownText, { text: answer }) : markdownText({ text: answer })
}

function safeHref(url) {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}

function linkLabel(url, title) {
  if (title !== undefined && title !== '') return title
  try {
    const { hostname } = new URL(url)
    return hostname === '' ? url : hostname
  } catch {
    return url
  }
}

function SafeLink({ url, label, className }) {
  const href = safeHref(url)
  if (href === undefined) return h('span', { class: className ?? '' }, label)
  return h(
    'a',
    { class: className ?? '', href: href, target: '_blank', rel: 'noopener noreferrer' },
    label,
  )
}

function SourceItem({ source, ordinal }) {
  return h(
    'li',
    { class: css.source ?? '', value: ordinal },
    h(SafeLink, { url: source.url, label: linkLabel(source.url, source.title), className: css.sourceLink }),
    source.snippet !== undefined && source.snippet !== '' && (
      h('div', { class: css.snippet ?? '' }, source.snippet)
    ),
    source.publishedAt !== undefined && source.publishedAt !== '' && (
      h('div', { class: css.published ?? '' }, source.publishedAt)
    ),
  )
}



function WebSearchBlock({ answer, sources, truncated, className, markdownText }) {
  const emptyRetrieval = (answer === undefined || answer === '') && sources.length === 0
  return h(
    'div',
    { class: clsx(css.block, className), 'data-web': 'search' },
    answer !== undefined && answer !== '' && (
      h('div', { class: css.answer ?? '' }, renderAnswer(answer, markdownText))
    ),
    emptyRetrieval ? (
      h('div', { class: css.empty ?? '' }, 'No results found.')
    ) : (
      h(
        'ol',
        { class: css.sources ?? '' },
        sources.map((source, index) => h(SourceItem, { key: index, source, ordinal: index + 1 })),
      )
    ),
    truncated && h('div', { class: css.truncated ?? '' }, 'Source list truncated'),
  )
}


function WebFetchBlock({ url, statusCode, truncated, className }) {
  return h(
    'div',
    { class: clsx(css.block, css.fetch, className), 'data-web': 'fetch' },
    h(SafeLink, { url, label: url, className: css.fetchUrl }),
    h(
      'div',
      { class: css.fetchMeta ?? '' },
      h('span', { class: css.status ?? '' }, 'HTTP ', statusCode),
      truncated && h('span', { class: css.truncated ?? '' }, 'Content truncated'),
    ),
  )
}


export function WebBlock(props) {
  return props.kind === 'search' ? h(WebSearchBlock, { ...props }) : h(WebFetchBlock, { ...props })
}
