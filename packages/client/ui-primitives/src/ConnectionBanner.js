import { createElement as h } from '@freddie/webjsx'
import css from './ConnectionBanner.css.js'

export function ConnectionBanner({ reconnecting, label = 'Connection lost, reconnecting…' }) {
  if (!reconnecting) return null
  return h('div', { class: css.banner ?? '' }, label)
}
