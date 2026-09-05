// Pill: small rounded label chip (view switcher tabs, filters, badges).

import { createElement as h } from 'webjsx'
import clsx from 'clsx'
import css from './Pill.css.js'

/**
 * Render a pill chip. Interactive when onclick is supplied (renders a button);
 * otherwise a static span.
 * @param props.active - selected/active visual state.
 * @returns pill element.
 */
export function Pill({ active = false, class: extraClass, children, onclick, ...rest }) {
  if (!onclick) {
    return h('span', { class: clsx(css.pill, active && css.active, extraClass) }, children)
  }
  return h(
    'button',
    {
      type: 'button',
      class: clsx(css.pill, css.interactive, active && css.active, extraClass),
      onclick: onclick,
      ...rest,
    },
    children,
  )
}
