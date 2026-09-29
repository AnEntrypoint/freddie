import { createElement as h } from '@freddie/webjsx'
import css from './TrajectoryTurnHeader.css.js'

const COLUMN_LABELS = ['Input', 'Output', 'Think', 'Time']

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
