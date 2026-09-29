import { createElement as h } from '@freddie/webjsx'
import { renderModal } from '@freddie/freddie-client-ui-primitives'
import css from './OnboardingModal.css.js'

const ignoreImplicitDismiss = () => {}

let cachedModalEl = null

export function OnboardingModal({
  title, focusTitle = false, children,
}) {
  const appRoot = document.getElementById('root')
  if (appRoot !== null && !appRoot.inert) appRoot.inert = true

  const bindTitle = (el) => {
    if (el !== null && focusTitle) el.focus()
  }

  cachedModalEl = renderModal(cachedModalEl, {
    open: true,
    title,
    onClose: ignoreImplicitDismiss,
    headless: true,
    className: css.dialog,
    children: [
      h('div', { class: css.content ?? '' },
        h('h2', { ref: bindTitle, class: css.title ?? '', tabindex: focusTitle ? -1 : undefined }, title),
        h('div', { class: css.body ?? '' }, children),
      ),
    ],
  })
  return null
}

export function closeOnboardingModal() {
  const appRoot = document.getElementById('root')
  if (appRoot !== null) appRoot.inert = false
  cachedModalEl?.remove()
  cachedModalEl = null
}
