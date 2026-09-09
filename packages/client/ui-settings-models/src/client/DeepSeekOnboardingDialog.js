/**
 * Official-DeepSeek first-run step. Readiness comes from the same
 * provider/settings/credential join as the Models page: any provider the user
 * can already talk to ends the step, and only a user with none is offered the
 * official DeepSeek route. The step reuses that page's credential editor in
 * the onboarding plugin's shared modal, so the key is entered once.
 *
 * Converted from a React hooks component: the load-on-idle and
 * complete()-on-readiness effects become plain calls made on each render,
 * guarded per-controller the same way WelcomeNotice guards `complete()`.
 */

import { createElement as h } from 'webjsx'
import { onboardingReadiness } from './store.js'
import { ProviderEditor } from './ProviderEditor.js'
import { closeOnboardingModal, OnboardingModal } from './OnboardingModal.js'
import styles from './DeepSeekOnboardingDialog.css.js'

/** Per-controller guard so a repeated terminal readiness calls `complete()` once. */
const finishedControllers = new WeakSet()

/* v8 ignore next 3 -- closed-union defaults only defend future source widening */
function assertNever(_value) {
  throw new Error('unexpected DeepSeek onboarding state')
}

/**
 * Prompt a first-run user for the official DeepSeek credential while no
 * provider can serve requests and that credential is writable.
 * @param props - settings-shell owner state and Models feature dependencies.
 * @returns the onboarding modal or null when onboarding needs no intervention.
 */
export function DeepSeekOnboardingDialog(props) {
  const { complete, controller, useModels, api, schema, t } = props
  const state = useModels(snapshot => snapshot)
  const readiness = onboardingReadiness(state)

  if (state.status === 'idle') void controller.load()

  if (
    readiness.kind === 'adapter-absent'
    || readiness.kind === 'provider-ready'
    || readiness.kind === 'unavailable'
  ) {
    if (!finishedControllers.has(controller)) {
      finishedControllers.add(controller)
      complete()
    }
  } else {
    finishedControllers.delete(controller)
  }

  switch (readiness.kind) {
    case 'loading':
    case 'adapter-absent':
    case 'provider-ready':
    case 'unavailable':
      closeOnboardingModal()
      return null
    case 'credential-missing':
      break
    /* v8 ignore next -- every current readiness variant is handled above */
    default:
      return assertNever(readiness)
  }

  const row = state.rows.find(candidate =>
    candidate.entry.provider === 'deepseek-official'
    && candidate.entry.settingsNs === 'llm-deepseek'
    && candidate.entry.settingsPath.length === 0)
  const namespace = state.namespaces.get('llm-deepseek')
  /* v8 ignore next 3 -- credential-missing is derived only from this exact joined row. */
  if (row === undefined || namespace === undefined) {
    closeOnboardingModal()
    return null
  }

  const finishCredential = (changed) => {
    if (!changed) {
      finishedControllers.add(controller)
      complete()
      return
    }
    void controller.load()
  }

  return h(OnboardingModal, { title: t('onboardingTitle') },
    h('p', { class: styles.description ?? '' }, t('onboardingDescription')),
    h('div', { class: styles.editor ?? '' },
      h(ProviderEditor, {
        provider: row.entry.provider,
        displayName: row.entry.displayName,
        namespace,
        schema,
        settingsPath: row.entry.settingsPath,
        api,
        t,
        readOnly: false,
        hideTitle: true,
        credentialOnly: true,
        credentialRequired: true,
        autoFocusCredential: true,
        cancelLabel: 'onboardingLater',
        submitLabel: 'onboardingSave',
        submitBusyLabel: 'onboardingSaving',
        onClose: finishCredential,
      }),
    ),
  )
}
