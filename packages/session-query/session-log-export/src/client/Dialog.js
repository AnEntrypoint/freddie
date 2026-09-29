import { createElement as h } from '@freddie/webjsx'
import { Button } from '@freddie/freddie-client-ui-primitives'

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
