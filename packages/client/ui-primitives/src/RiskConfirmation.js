import { createElement as h, Fragment } from '@freddie/webjsx'
import { renderModal } from './Modal.js'
import { Button } from './Button.js'
import { IconWarningOutline16 } from './icons/index.js'
import css from './RiskConfirmation.css.js'


export function renderRiskConfirmation(el, {
  open,
  title,
  description,
  acknowledgeLabel,
  cancelLabel,
  confirmLabel,
  acknowledged,
  disabled = false,
  onAcknowledgedChange,
  onCancel,
  onConfirm,
}) {
  return renderModal(el, {
    open,
    onClose: onCancel,
    title,
    className: css.confirmation ?? '',
    contentClassName: css.confirmationContent ?? '',
    footer: [
      h(Button, { variant: 'outline', class: css.modalAction, onclick: onCancel }, cancelLabel),
      h(
        Button,
        {
          variant: 'primary',
          class: css.confirmAction,
          disabled: disabled || !acknowledged,
          onclick: onConfirm,
        },
        confirmLabel,
      ),
    ],
    children: (
      h(
        Fragment,
        null,
        h(
          'div',
          { class: css.warning ?? '' },
          h(IconWarningOutline16, { size: 18, className: css.warningIcon }),
          h('p', null, description),
        ),
        h(
          'label',
          { class: css.acknowledgement ?? '' },
          h('input', {
            type: 'checkbox',
            checked: acknowledged,
            disabled: disabled,
            autofocus: true,
            onchange: (event) => { onAcknowledgedChange(event.currentTarget.checked) },
          }),
          h('span', null, acknowledgeLabel),
        ),
      )
    ),
  })
}

export function RiskConfirmation(props) {
  return renderRiskConfirmation(null, props)
}
