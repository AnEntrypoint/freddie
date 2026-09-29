import { createElement as h, Fragment } from '@freddie/webjsx'
import css from './GeneralSection.css.js'

function asChild(node) {
  return node
}

export function GeneralSection({ renderSlot }) {
  return (
    h('div', {class: css.section ?? ''},
      asChild(renderSlot('settings.general.item', {})),
    )
  )
}
