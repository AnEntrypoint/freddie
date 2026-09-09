/**
 * Controlled risk acknowledgement dialog shared by product surfaces that
 * must gate a sensitive action behind an explicit checkbox.
 *
 * Converted from a React function component to a webjsx custom element
 * wrapping `renderModal`: the one-shot `Modal(...)` helper always creates
 * and appends a brand-new `dsh-modal` to `document.body`, so calling it
 * fresh from a plain function component on every parent re-render (the
 * shape every one of this file's callers uses — a class field like
 * `#confirmingFullAccess` flips and `#render()` fires again) orphaned a new
 * modal on every state change instead of updating one in place: stale
 * modals (some still mid-open) piled up in the DOM and could swallow clicks
 * meant for the current one. Holding the `dsh-modal` across renders via
 * `renderModal(this.#modal, ...)` (Modal.tsx's own pattern, mirrored here)
 * fixes that at the source for every caller at once.
 */
import { createElement as h, Fragment } from 'webjsx'
import { renderModal } from './Modal.js'
import { Button } from './Button.js'
import { IconWarningOutline16 } from './icons/index.js'
import css from './RiskConfirmation.css.js'

/**
 * Update (or create) the underlying `dsh-modal` for one risk confirmation.
 * @param el - the modal returned by a prior call, or null to create one.
 * @param props - see {@link RiskConfirmationProps}.
 * @returns the `dsh-modal` element; hold it and pass it back in on the next render.
 */
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

/**
 * One-shot creation/update helper preserving the original function-component
 * call shape for a caller that has not yet been converted to hold the
 * element itself. Prefer `renderRiskConfirmation(el, props)` in any owner
 * that re-renders more than once (holds the element across renders instead
 * of recreating it every call) — this wrapper cannot do that on the
 * caller's behalf since it has no owner-scoped place to keep `el`.
 */
export function RiskConfirmation(props) {
  return renderRiskConfirmation(null, props)
}
