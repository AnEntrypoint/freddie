/** The General section: one column rendering feature-owned item contributions. */
import { createElement as h, Fragment } from 'webjsx'
import css from './GeneralSection.css.js'

/** Cast a renderSlot() RenderOutput result into a webjsx-embeddable child. */
function asChild(node) {
  return node
}

/**
 * Render the General section content column.
 * @param props - composed slot props (contract/slots.ts).
 * @returns the section element tree.
 */
export function GeneralSection({ renderSlot }) {
  return (
    h('div', {class: css.section ?? ''},
      asChild(renderSlot('settings.general.item', {})),
    )
  )
}
