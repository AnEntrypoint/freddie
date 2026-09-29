import { createElement as h } from '@freddie/webjsx'
import css from './TrajectoryGroupHeader.css.js'

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
