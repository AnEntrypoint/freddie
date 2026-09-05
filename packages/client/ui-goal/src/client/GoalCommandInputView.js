import { createElement as h } from 'webjsx'
import { MessageText } from '@freddie/freddie-client-ui-primitives'
import css from './GoalCommandInputView.css.js'

/** Right-aligned `/goal` input bubble without ordinary message actions. */
export function GoalCommandInputView({
  node, t,
}) {
  const data = node.data
  return (
    h('div', {
      class: css.row ?? '',
      'data-command-input': '',
      role: 'group',
      'aria-label': t('commandInput.aria'),
    },
      h('div', {class: css.stack ?? ''},
        h('div', {class: css.bubble ?? ''},
          h(MessageText, {text: data.text}),
        ),
      ),
    )
  )
}
