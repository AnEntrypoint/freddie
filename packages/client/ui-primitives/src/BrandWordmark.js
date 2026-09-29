import { createElement as h } from '@freddie/webjsx'
import { FishLogo } from './FishLogo.js'

export function BrandWordmark({ size = 24, className, includeMark = true }) {
  return h(
    'span',
    { class: className ?? '', style: 'display: inline-flex; align-items: center; gap: 0.5em;' },
    includeMark ? h(FishLogo, { size }) : null,
    h('span', { style: `font-weight: 700; font-size: ${size * 0.75}px; letter-spacing: -0.02em;` }, 'freddie'),
  )
}
