// TrajectoryTurn: sticky Turn header plus the padded Message/Step body.

import { createElement as h } from 'webjsx'
import { TrajectoryTurnHeader } from './TrajectoryTurnHeader.js'
import css from './TrajectoryTurn.css.js'

/**
 * Render one turn section (sticky header + body).
 * @param props - turn index and body children.
 * @returns the turn section element.
 */
export function TrajectoryTurn({ turn, children }) {
  return (
    h('section', {class: css.root ?? '', 'data-turn': turn},
      h(TrajectoryTurnHeader, {turn: turn}),
      h('div', {class: css.body ?? ''}, children),
    )
  )
}
