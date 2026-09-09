// Freddie brand wordmark: mustache mark + "freddie" text. Text rides normal
// CSS color (not baked into SVG paths) so it follows the theme and any
// locale/font substitution automatically; the mark rides currentColor.

import { createElement as h } from 'webjsx'
import { FishLogo } from './FishLogo.js'

/**
 * Render the full brand wordmark.
 * @param props.size - mark height in px (default 24).
 * @param props.className - extra class for layout placement.
 * @param props.includeMark - whether to include the leading mustache mark.
 * @returns the wordmark (mark + text), theme-aware.
 */
export function BrandWordmark({ size = 24, className, includeMark = true }) {
  return h(
    'span',
    { class: className ?? '', style: 'display: inline-flex; align-items: center; gap: 0.5em;' },
    includeMark ? h(FishLogo, { size }) : null,
    h('span', { style: `font-weight: 700; font-size: ${size * 0.75}px; letter-spacing: -0.02em;` }, 'freddie'),
  )
}
