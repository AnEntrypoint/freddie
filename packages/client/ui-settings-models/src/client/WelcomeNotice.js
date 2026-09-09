/**
 * Product-wide, versioned internal-testing notice.
 *
 * Converted from a React hooks component: the `finished` ref-guarded
 * `complete()` call and the load/acknowledge-triggered effects become plain
 * calls made on each render, guarded the same way the `useRef` guard did —
 * this component is created fresh by the slot renderer on every snapshot
 * change (it is a plain function, not a stateful custom element), so
 * "already finished" state is tracked outside on the store shape itself
 * (`state.acknowledged`) rather than in an instance field.
 */

import { createElement as h } from 'webjsx'
import { Button } from '@freddie/freddie-client-ui-primitives'
import { closeOnboardingModal, OnboardingModal } from './OnboardingModal.js'
import css from './WelcomeNotice.css.js'

/** Per-store guard so a repeated finished snapshot calls `complete()` once. */
const finishedStores = new WeakSet()

/**
 * Render the current notice until its exact copy version is acknowledged.
 * @param props - settings-shell owner state and welcome dependencies.
 * @returns the welcome modal or null while the step decides not to show.
 */
export function WelcomeNotice(props) {
  const { complete, controller, useWelcome, t } = props
  const state = useWelcome(snapshot => snapshot)

  const finish = () => {
    if (finishedStores.has(controller)) return
    finishedStores.add(controller)
    complete()
  }

  if (state.status === 'idle') void controller.load()
  if (state.acknowledged) {
    finish()
    closeOnboardingModal()
    return null
  }
  if (state.status === 'idle' || state.status === 'loading') return null

  const acknowledge = async () => {
    if (await controller.acknowledge()) finish()
  }
  const paragraphs = t('welcomeBody').split('\n\n')

  return h(OnboardingModal, { title: t('welcomeTitle'), focusTitle: true },
    h('div', { class: css.copy ?? '' },
      paragraphs.map(paragraph => h('p', { key: paragraph }, paragraph)),
    ),
    state.error === null ? null : h('p', { class: css.error ?? '', role: 'alert' }, t('welcomeError')),
    h('div', { class: css.actions ?? '' },
      h(Button, {
        variant: 'primary',
        class: css.primary,
        disabled: state.status === 'saving',
        onclick: () => { void acknowledge() },
      }, t('welcomeContinue')),
    ),
  )
}
