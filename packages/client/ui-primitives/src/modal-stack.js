const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"]'

export function isTopmostModal(dialog) {
  if (dialog === null) return false
  const dialogs = document.querySelectorAll(MODAL_SELECTOR)
  return dialogs[dialogs.length - 1] === dialog
}
