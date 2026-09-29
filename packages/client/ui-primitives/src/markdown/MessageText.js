import { createElement as h } from '@freddie/webjsx'
import css from './MessageText.css.js'

export function MessageText({ text }) {
  return h('div', { class: css.text ?? '' }, text)
}
