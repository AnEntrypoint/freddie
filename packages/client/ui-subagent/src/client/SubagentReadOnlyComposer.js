import { createElement as h } from 'webjsx'
import css from './SubagentReadOnlyComposer.css.js'

/**
 * Explain why the normal composer is unavailable for an addressed child.
 * @param props - selector-owned read-only reason plus standard slot props.
 * @returns A read-only composer replacement.
 */
export function SubagentReadOnlyComposer({
  matched, t,
}) {
  const oneShot = matched.reason === 'one-shot'
  return (
    h('div', {class: css.frame ?? '', role: 'status'},
      h('strong', null, t(oneShot ? 'readonly.oneShot.title' : 'readonly.title')),
      h('span', null,
        t(oneShot ? 'readonly.oneShot.body' : 'readonly.body'),
      ),
    )
  )
}
