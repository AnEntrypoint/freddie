import { createElement as h } from '@freddie/webjsx'
import css from './SubagentReadOnlyComposer.css.js'

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
