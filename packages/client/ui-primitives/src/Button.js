import { createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import css from './Button.css.js'

export function Button({ variant = 'ghost', size = 'md', icon, class: extraClass, children, ...rest }) {
  return h(
    'button',
    { type: 'button', class: clsx(css.button, css[variant], css[size], extraClass), ...rest },
    icon != null && h('span', { class: css.icon ?? '' }, icon),
    children,
  )
}
