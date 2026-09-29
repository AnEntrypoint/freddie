import { createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import css from './StateDot.css.js'

/** Outer 3x3 matrix cells (2px pixels on a 10px grid), clockwise from top-left. */
const MATRIX_CELLS = [
  [0, 0], [4, 0], [8, 0], [8, 4], [8, 8], [4, 8], [0, 8], [0, 4],
]

const CHASE_STEP_MS = 125

const startedMidChaseDelayMs = index => (index - MATRIX_CELLS.length) * CHASE_STEP_MS

/**
 * Render a state dot.
 * @param props.state - which of the four states to show.
 * @param props.size - outer diameter in px (default 10, the figma size).
 * @param props.className - extra class for layout placement.
 * @returns the dot element (aria-hidden; pair with text for accessibility).
 */
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
