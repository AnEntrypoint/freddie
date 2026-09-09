// TrajectoryGroupHeader: "Message" or "Step N" row with optional description.

import { createElement as h } from 'webjsx'
import css from './TrajectoryGroupHeader.css.js'

/**
 * Render a Message/Step group header inside a turn body.
 * @param props - title and optional description.
 * @returns the group header element.
 */
export function TrajectoryGroupHeader({ title, description }) {
  return (
    h('div', {class: css.root ?? ''},
      h('span', {class: css.title ?? ''}, title),
      description !== undefined && description !== ''
        ? h('span', {class: css.description ?? ''}, description)
        : null,
    )
  )
}
