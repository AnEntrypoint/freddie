/** Every open modal dialog carries these attributes; document order is stacking order. */
const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"]'

/**
 * Whether a dialog is the topmost open modal in the document: the last
 * `[role="dialog"][aria-modal="true"]` in document order, the same rule the
 * shortcut keyboard adapter uses to name the active modal. A modal's document
 * keydown handlers act only while this holds, so stacked dialogs never close
 * together or pull focus out from behind the one above.
 * @param dialog - the dialog element a handler owns, or null when it has none rendered.
 * @returns true when no other open modal dialog follows `dialog` in the document.
 */
export function isTopmostModal(dialog) {
  if (dialog === null) return false
  const dialogs = document.querySelectorAll(MODAL_SELECTOR)
  return dialogs[dialogs.length - 1] === dialog
}
