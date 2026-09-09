/** Localized cards for `cordis_stop` and `cordis_undefine`. */

import { createElement as h } from 'webjsx'
import {
  IconInspectOutline12, IconStopFill16, IconTrashOutline16, StateDot,
} from '@freddie/freddie-client-ui-primitives'
import { cordisActionCard } from './card-model.js'
import css from './CordisRunRow.css.js'

/** Render one Stop or Remove call with Cordis-owned localized copy. */
export function CordisActionRow({ callId, toolName, block, inspect, t }) {
  const card = cordisActionCard(block)
  const remove = toolName === 'cordis_undefine'
  const summary = card.errorSummary ?? card.pluginId ?? callId

  return (
    h('div', {class: css.card ?? '', 'data-tool': toolName, 'data-state': card.state},
      h('div', {class: css.row ?? ''},
        h('span', {class: css.icon ?? ''},
          card.state === 'error'
            ? h(StateDot, {state: 'error'})
            : card.state === 'stopped'
              ? h(StateDot, {state: 'warning'})
              : remove ? h(IconTrashOutline16, {size: 14}) : h(IconStopFill16, {size: 14}),
        ),
        h('span', {class: css.title ?? ''}, t(remove ? 'row.removeTitle' : 'row.stopTitle')),
        h('span', {class: css.separator ?? '', 'aria-hidden': ''}),
        h('span', {class: card.errorSummary === null ? (css.summary ?? '') : (css.error ?? '')}, summary),
        inspect !== undefined && h('button', {type: 'button', class: css.inspect ?? '', 'aria-label': 'Inspect', onclick: inspect},
          h(IconInspectOutline12, null),
        ),
      ),
      card.output !== null && h('pre', {class: css.output ?? ''}, card.output),
    )
  )
}
