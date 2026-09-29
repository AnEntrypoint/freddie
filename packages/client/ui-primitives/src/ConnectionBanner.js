import { createElement as h } from '@freddie/webjsx'
import css from './ConnectionBanner.css.js'

/**
 * Render the reconnecting banner.
 * @param props.reconnecting - true while the connection is in backoff/retry.
 * @param props.label - banner text; the owner passes localized copy (this
 * package is cordis-free, so copy arrives via props).
 * @returns the banner, or null when connected.
 */
export function ConnectionBanner({ reconnecting, label = 'Connection lost, reconnecting…' }) {
  if (!reconnecting) return null
  return h('div', { class: css.banner ?? '' }, label)
}
