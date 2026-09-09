/**
 * Shared modal chrome for every step registered by this onboarding plugin.
 *
 * Converted from a React hooks component: the root-inert toggle and
 * title-focus effects were `useEffect`s tied to mount/unmount and prop
 * changes. This component always renders open (never toggled by a `open`
 * prop), so the effects collapse to plain imperative calls made once, here,
 * each time the step calls this function to build its VNode — matching the
 * lifetime of the returned `Modal` element.
 */

import { createElement as h } from 'webjsx'
import { renderModal } from '@freddie/freddie-client-ui-primitives'
import css from './OnboardingModal.css.js'

const ignoreImplicitDismiss = () => {}

// Modal's own one-shot factory (Modal(props), the bare h(Modal,...) call
// this file used to make) creates and appends a NEW freddie-modal element to
// document.body on every call, with nothing removing the previous one --
// this function re-runs on every re-render of the onboarding step (the
// doc comment above: "each time the step calls this function"), which is
// driven by the step's own store subscription, not a one-shot mount. That
// leaked a growing stack of duplicate modal masks/dialogs into the DOM.
// Onboarding shows at most one modal at a time, so a module-level
// singleton is the right cache shape (same as DetailsPanel.js's
// size-1 cachedArgsBlock, not a per-identity WeakMap).
let cachedModalEl = null

/**
 * Render a blocking onboarding dialog and keep the application root inert
 * for as long as the step keeps rendering this modal.
 * @param props.title - accessible and visible dialog title.
 * @param props.focusTitle - focus the title when the step has no form control.
 * @param props.children - step-owned body and actions.
 * @returns the body-portaled modal.
 */
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
  return cachedModalEl
}

/**
 * Release the resources OnboardingModal claimed: un-inert the application
 * root and remove the cached freddie-modal element. Neither is reachable from
 * inside OnboardingModal itself -- it is a plain function with no unmount
 * signal of its own, called every render while a step is active and simply
 * not called once that step stops rendering it. The onboarding host renders
 * at most one step at a time (SettingsRoot's own onboardingSteps.find, not
 * .filter), so each step's own null-returning branch owns calling this the
 * moment it stops needing the shared modal -- idempotent, so calling it from
 * a branch that never actually showed the modal is harmless.
 */
export function closeOnboardingModal() {
  const appRoot = document.getElementById('root')
  if (appRoot !== null) appRoot.inert = false
  cachedModalEl?.remove()
  cachedModalEl = null
}
