/**
 * The action row every provider card ends with: dismiss on the left, commit on
 * the right.
 *
 * The two cards commit different things — one creates a route, one edits an
 * existing profile — but the row itself carries no such knowledge. It renders
 * what it is handed, so the cards keep sole ownership of when a commit is
 * allowed and what the in-flight wording is.
 *
 * Cancel refuses input only while a commit is in flight, never because the card
 * is disabled: a card the deployment cannot write to must still be dismissable.
 *
 * @module freddie-client-ui-settings-models/client/EditorFooter
 */

import { createElement as h } from 'webjsx'
import styles from './ModelsSection.css.js'

/**
 * Render one provider card's action row.
 * @param props - the labels, commit gating, and handlers the owning card supplies.
 * @returns the cancel/commit row.
 */
export function EditorFooter(props) {
  const { t } = props
  return h('div', { class: styles['editorActions'] ?? '' },
    h('button', {
      type: 'button',
      class: styles['secondaryButton'] ?? '',
      disabled: props.busy,
      onclick: props.onCancel,
    }, t(props.cancelLabel ?? 'cancel')),
    h('button', {
      type: 'button',
      class: styles['primaryButton'] ?? '',
      disabled: props.submitDisabled,
      onclick: props.onSubmit,
    }, props.busy ? t(props.submitBusyLabel) : t(props.submitLabel)),
  )
}
