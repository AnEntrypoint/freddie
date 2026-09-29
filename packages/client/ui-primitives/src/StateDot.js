import { createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import css from './StateDot.css.js'

const MATRIX_CELLS = [
  [0, 0], [4, 0], [8, 0], [8, 4], [8, 8], [4, 8], [0, 8], [0, 4],
]

const CHASE_STEP_MS = 125

const startedMidChaseDelayMs = index => (index - MATRIX_CELLS.length) * CHASE_STEP_MS

export function StateDot({ state, size = 10, className }) {
  if (state === 'ongoing') {
    return h(
      'svg',
      {
        class: clsx(css.matrix, className),
        'data-state': 'ongoing',
        width: String(size),
        height: String(size),
        viewBox: '0 0 10 10',
        'shape-rendering': 'crispEdges',
        'aria-hidden': 'true',
      },
      MATRIX_CELLS.map(([x, y], index) => (
        h('rect', {
          class: css.cell ?? '',
          x: String(x),
          y: String(y),
          width: '2',
          height: '2',
          style: `animation-delay: ${startedMidChaseDelayMs(index)}ms`,
        })
      )),
    )
  }
  return h('span', {
    class: clsx(css.dot, className),
    'data-state': state,
    style: `width: ${size}px; height: ${size}px`,
    'aria-hidden': 'true',
  })
}
