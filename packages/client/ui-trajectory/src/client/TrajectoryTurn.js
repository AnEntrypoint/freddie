import { createElement as h } from '@freddie/webjsx'
import { TrajectoryTurnHeader } from './TrajectoryTurnHeader.js'
import css from './TrajectoryTurn.css.js'

export function TrajectoryTurn({ turn, children }) {
  return (
    h('section', {class: css.root ?? '', 'data-turn': turn},
      h(TrajectoryTurnHeader, {turn: turn}),
      h('div', {class: css.body ?? ''}, children),
    )
  )
}
