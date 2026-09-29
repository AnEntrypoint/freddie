import { createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import { MarkdownText } from './markdown/MarkdownText.js'
import css from './WebBlock.css.js'

function renderAnswer(answer, markdownText) {
  return markdownText === undefined ? h(MarkdownText, { text: answer }) : markdownText({ text: answer })
}

/**
 * The URL to link to, or undefined when the URL must render as plain text. Only
 * http(s) becomes a navigable external anchor, so a `javascript:`/`data:`/`file:`
 * URL or an unparseable string never reaches the DOM as an href. This is the
 * http(s) subset of the allowlist MarkdownText applies to untrusted links —
 * MarkdownText also permits `mailto:`, deliberately excluded here since a
 * retrieval URL is never a mail address.
 * @param url - the source or fetch URL, from tool result content.
 * @returns the href to use, or undefined for plain text.
 */
function safeHref(url) {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}

/**
 * The link's visible label: the title when the provider gave one, otherwise the
 * URL's hostname, falling back to the raw URL when it does not parse OR parses
 * to an empty hostname (a `file:`/`data:`/`javascript:` URL), so a label is
 * never blank.
 * @param url - the source URL.
 * @param title - the provider title, if any.
 * @returns the label text.
 */
function linkLabel(url, title) {
  if (title !== undefined && title !== '') return title
  try {
    const { hostname } = new URL(url)
    return hostname === '' ? url : hostname
  } catch {
    return url
  }
}

/**
 * A single URL rendered as a safe external anchor, or as plain text when the
 * URL is not an http(s) link.
 * @param props.url - the URL to render.
 * @param props.label - the visible label.
 * @param props.className - class for the anchor or the plain span.
 * @returns the anchor or span element.
 */
function SafeLink({ url, label, className }) {
  const href = safeHref(url)
  if (href === undefined) return h('span', { class: className ?? '' }, label)
  return h(
    'a',
    { class: className ?? '', href: href, target: '_blank', rel: 'noopener noreferrer' },
    label,
  )
}

/**
 * One source row in a search card: the safe link plus its snippet and date. The
 * `<li value>` pins the source's 1-based citation index explicitly rather than
 * relying on the `<ol>`'s implicit numbering, so a row reads by its real index
 * even inside the scroll container.
 * @param props.source - the source to render.
 * @param props.ordinal - the source's 1-based position in the full list.
 * @returns the source list item.
 */
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

/**
 * @typedef {object} WebSource
 * @property {string} url - the source URL.
 * @property {string} [title] - provider-supplied title; falls back to the URL's hostname when absent.
 * @property {string} [snippet] - short excerpt shown under the link.
 * @property {string} [publishedAt] - publish date/time text shown under the snippet.
 */

/**
 * @typedef {object} WebSearchBlockProps
 * @property {string} [answer] - assistant summary rendered above the source list.
 * @property {Array<WebSource>} sources - the retrieved sources, numbered in list order.
 * @property {boolean} [truncated] - whether the source list was cut short by the provider.
 * @property {string} [className]
 * @property {function({text: string}): *} [markdownText] - override for rendering `answer`; defaults to {@link import('./markdown/MarkdownText.js').MarkdownText}.
 */

/**
 * The search card body: the answer over the full source list, which scrolls in
 * place once it exceeds the `.sources` container height.
 * @param props - see {@link WebSearchBlockProps}.
 * @returns the search card element.
 */
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

/**
 * @typedef {object} WebFetchBlockProps
 * @property {string} url - the fetched URL, rendered as the visible link and its own label.
 * @property {number|string} statusCode - the HTTP status, shown as "HTTP <statusCode>".
 * @property {boolean} [truncated] - whether the fetched content was cut short.
 * @property {string} [className]
 */

/**
 * The fetch card body: the linked URL and its HTTP status.
 * @param props - see {@link WebFetchBlockProps}.
 * @returns the fetch card element.
 */
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

/**
 * @typedef {object} WebBlockProps
 * @property {'search'|'fetch'} kind - selects whether the card renders as {@link WebSearchBlockProps} or {@link WebFetchBlockProps}.
 * @property {string} [answer] - `kind: 'search'` only; see {@link WebSearchBlockProps}.
 * @property {Array<WebSource>} [sources] - `kind: 'search'` only; see {@link WebSearchBlockProps}.
 * @property {function({text: string}): *} [markdownText] - `kind: 'search'` only; see {@link WebSearchBlockProps}.
 * @property {string} [url] - `kind: 'fetch'` only; see {@link WebFetchBlockProps}.
 * @property {number|string} [statusCode] - `kind: 'fetch'` only; see {@link WebFetchBlockProps}.
 * @property {boolean} [truncated] - result list/content was truncated.
 * @property {string} [className]
 */

/**
 * Render a completed web retrieval as a structured card.
 * @param props - see {@link WebBlockProps}; `kind` selects the search or fetch body.
 * @returns the web card element.
 */
export function WebBlock(props) {
  return props.kind === 'search' ? h(WebSearchBlock, { ...props }) : h(WebFetchBlock, { ...props })
}
