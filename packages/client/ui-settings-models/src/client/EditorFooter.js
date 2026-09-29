import { createElement as h } from '@freddie/webjsx'
import styles from './ModelsSection.css.js'

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
