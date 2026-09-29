import { createElement as h } from '@freddie/webjsx'
import { Button } from '@freddie/freddie-client-ui-primitives'
import { closeOnboardingModal, OnboardingModal } from './OnboardingModal.js'
import css from './WelcomeNotice.css.js'

const finishedStores = new WeakSet()

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
