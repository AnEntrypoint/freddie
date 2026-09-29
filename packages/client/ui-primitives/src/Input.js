import { createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import css from './Input.css.js'

export function Input({ icon, class: extraClass, ...rest }) {
  return h(
    'span',
    { class: clsx(css.wrap, extraClass) },
    icon != null && h('span', { class: css.icon ?? '' }, icon),
    h('input', { class: css.input ?? '', ...rest }),
  )
}
