// Button: token-styled button atom. Variants map to the --freddie-alias-button-*
// fill families; no framework imports, all behavior via props.

import { createElement as h } from 'webjsx'
import clsx from 'clsx'
import css from './Button.css.js'

/**
 * Render a button.
 * @param props.variant - visual family (default 'ghost').
 * @param props.size - 'md' 36px capsule (figma Button) or 'sm' 28px compact.
 * @param props.icon - optional leading 16px icon node.
 * @returns the button vnode; native button attributes pass through.
 */
export function Button({ variant = 'ghost', size = 'md', icon, class: extraClass, children, ...rest }) {
  return h(
    'button',
    { type: 'button', class: clsx(css.button, css[variant], css[size], extraClass), ...rest },
    icon != null && h('span', { class: css.icon ?? '' }, icon),
    children,
  )
}
