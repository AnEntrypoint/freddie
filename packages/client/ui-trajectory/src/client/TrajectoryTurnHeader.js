// TrajectoryTurnHeader: sticky per-turn bar with Input/Output/Think/Time labels.

import { createElement as h } from 'webjsx'
import css from './TrajectoryTurnHeader.css.js'

const COLUMN_LABELS = ['Input', 'Output', 'Think', 'Time']

/**
 * Render the sticky turn header row.
 * @param props.turn - turn index.
 * @returns the sticky header element.
 */
export function TrajectoryTurnHeader({ turn }) {
  return (
    h('div', {class: css.root ?? ''},
      h('div', {class: css.inner ?? ''},
        h('span', {class: css.title ?? ''}, 'Turn ', turn),
        h('div', {class: css.columns ?? '', 'aria-hidden': 'true'},
          COLUMN_LABELS.map(label => (
            h('span', {key: label, class: css.column ?? ''}, label)
          )),
        ),
      ),
    )
  )
}
