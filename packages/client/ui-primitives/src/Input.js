import { createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import css from './Input.css.js'

/**
 * Render a text input with an optional leading icon.
 * @param props.icon - optional 16px leading icon node.
 * @returns wrapper span containing the native input; input attributes pass through.
 */
export function Input({ icon, class: extraClass, ...rest }) {
  return h(
    'span',
    { class: clsx(css.wrap, extraClass) },
    icon != null && h('span', { class: css.icon ?? '' }, icon),
    h('input', { class: css.input ?? '', ...rest }),
  )
}
