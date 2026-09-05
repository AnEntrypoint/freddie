// WebBlock: the surface for a completed web retrieval. One component draws both
// kinds of the `web` render intent, discriminated by `kind`: a `search` shows an
// optional provider answer above a citation list of sources (each a safe
// external link labelled by its title, or its hostname when the provider gave
// none, with the snippet and publication date below it), and a `fetch` shows a
// compact retrieval summary (the linked final URL and its HTTP status). Both
// mark a capped retrieval. Every link is a same-origin-safe external anchor:
// only http(s) URLs become anchors (target/rel set) — the http(s) subset of the
// allowlist MarkdownText applies to untrusted assistant-authored links (it also
// permits mailto, excluded here); an unparseable or non-http URL renders as
// plain text. Geometry, radius, and fonts mirror CodeBlock/TerminalBlock so a
// web card reads as one family with them; the whole source list renders inside a
// fixed-height scroll container (its `.sources` max-height), so a long list
// scrolls in place rather than growing the card — and that container's
// `padding-left` must stay wide enough for the widest `<li>` marker, since a
// scroll container clips inline-start overflow irrecoverably. The card draws every source the
// view carries: the tool already cut the list to its source cap, and `truncated`
// reports that cut. A content-only transform downstream of the tool — spill-policy
// replacing an oversized result's text while leaving its presentationMeta whole —
// can still narrow what the model reads below this list.

import { createElement as h } from 'webjsx'
import clsx from 'clsx'
import { MarkdownText } from './markdown/MarkdownText.js'
import css from './WebBlock.css.js'

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
 * The search card body: the answer over the full source list, which scrolls in
 * place once it exceeds the `.sources` container height.
 * @param props - see {@link WebSearchBlockProps}.
 * @returns the search card element.
 */
function WebSearchBlock({ answer, sources, truncated, className }) {
  // A provider may legitimately return no answer and no sources; the chat WebRow
  // does not show the raw result content, so without this the user would see an
  // empty card. Mirror the backend's `No results found.` render text.
  const empty = (answer === undefined || answer === '') && sources.length === 0
  return h(
    'div',
    { class: clsx(css.block, className), 'data-web': 'search' },
    answer !== undefined && answer !== '' && (
      h('div', { class: css.answer ?? '' }, h(MarkdownText, { text: answer }))
    ),
    empty ? (
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
 * Render a completed web retrieval as a structured card.
 * @param props - see {@link WebBlockProps}; `kind` selects the search or fetch body.
 * @returns the web card element.
 */
export function WebBlock(props) {
  return props.kind === 'search' ? h(WebSearchBlock, { ...props }) : h(WebFetchBlock, { ...props })
}
