// MessageText is the literal-text primitive for user and steering content; assistant output uses MarkdownText.

import { createElement as h } from 'webjsx'
import css from './MessageText.css.js'

export function MessageText({ text }) {
  return h('div', { class: css.text ?? '' }, text)
}
