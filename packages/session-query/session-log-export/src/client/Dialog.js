import { createElement as h } from 'webjsx'
import { Button } from '@freddie/freddie-client-ui-primitives'

/**
 * Compute the shared result modal's props from the Session Header
 * contribution's own props. Split out from JSX so the owner (HeaderAction's
 * custom element) can hold and update one `freddie-modal` instance across
 * renders via `renderModal(el, props)`, instead of a bare `<Modal>` call
 * creating a fresh instance every render.
 * @param props - Session runtime, bound controller state, actions, and localized copy.
 * @returns the modal's props.
 */
export function dialogProps({
  sessionId, useSessionLogDownload, dismiss, t,
}) {
  const entry = useSessionLogDownload(state => state.bySession[String(sessionId)])

  const status = entry?.status
  const open = entry?.open === true
  const error = status === 'error' ? entry?.error || t('dialog.commandFailed') : null
  const title = status === 'downloading'
    ? t('dialog.preparingTitle')
    : status === 'success' ? t('dialog.successTitle') : t('dialog.errorTitle')
  const description = status === 'downloading'
    ? t('dialog.preparingDescription')
    : status === 'success' ? t('dialog.successDescription') : error ?? t('dialog.commandFailed')

  return {
    open,
    onClose: () => { dismiss(sessionId) },
    title,
    description,
    closeLabel: t('dialog.close'),
    footer: h(Button, {variant: 'primary', onclick: () => { dismiss(sessionId) }}, t('dialog.close')),
  }
}
