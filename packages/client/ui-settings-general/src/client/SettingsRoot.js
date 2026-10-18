import { applyDiff, createElement as h, Fragment } from '@freddie/webjsx'
import clsx from 'clsx'
import {
  IconAgentPresetOutline16, IconCloseOutline16, IconDataOutline16,
  IconPersonalizationOutline16, IconSettingsOutline16,
  defineElement, isTopmostModal,
} from '@freddie/freddie-client-ui-primitives'
import css from './SettingsRoot.css.js'

function asChild(node) {
  return node
}

function navIcon(id) {
  if (id === 'models') return h(IconDataOutline16, {className: css.navIcon, size: 16})
  if (id === 'agent-presets') return h(IconAgentPresetOutline16, {className: css.navIcon, size: 16})
  if (id === 'plugins') return h(IconPersonalizationOutline16, {className: css.navIcon, size: 16})
  return h(IconSettingsOutline16, {className: css.navIcon, size: 16})
}

export class FreddieSettingsRoot extends HTMLElement {
  #props = null
  #open = false
  #activeId = undefined
  #completedOnboarding = new Set()
  #lastOnboardingActive = undefined
  #escapeHandler = null
  #closeButtonFocused = false
  #returnFocusTo = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#unbindEscape()
  }

  #close = () => {
    this.#open = false
    this.#activeId = undefined
    this.#render()
  }

  #openSection = (id) => {
    this.#activeId = id
    this.#open = true
    this.#render()
  }

  #bindEscape() {
    if (this.#escapeHandler !== null) return
    this.#escapeHandler = (e) => {
      if (!isTopmostModal(this.querySelector('[role="dialog"]'))) return
      if (e.key === 'Escape') { this.#close(); return }
      if (e.key === 'Tab') this.#trapTab(e)
    }
    document.addEventListener('keydown', this.#escapeHandler)
  }

  #unbindEscape() {
    if (this.#escapeHandler === null) return
    document.removeEventListener('keydown', this.#escapeHandler)
    this.#escapeHandler = null
  }

  #trapTab(e) {
    const dialog = this.querySelector('[role="dialog"]')
    if (dialog === null) return
    const focusable = [...dialog.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), '
      + 'select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first || !dialog.contains(document.activeElement)) {
        e.preventDefault()
        last.focus()
      }
    } else if (document.activeElement === last || !dialog.contains(document.activeElement)) {
      e.preventDefault()
      first.focus()
    }
  }

  #renderPanel(rows, renderSlot) {
    const active = rows.find(r => r.id === this.#activeId)?.id ?? rows[0]?.id
    const titleId = 'freddie-settings-root-title'
    return (
      h('div', {class: css.overlay ?? '', role: 'presentation'},
        h('div', {class: css.mask ?? '', 'aria-hidden': 'true', onclick: this.#close}),
        h('div', {class: css.panel ?? '', role: 'dialog', 'aria-modal': 'true', 'data-shortcut-modal': 'settings', 'aria-labelledby': titleId},
          h('nav', {class: css.nav ?? ''},
            h('div', {class: css.navTitle ?? '', id: titleId}, asChild(renderSlot('settings.header', {}))),
            h('div', {class: css.navList ?? ''},
              rows.map(row => (
                h('button', {
                  type: 'button',
                  class: clsx(css.navCell, row.id === active && css.active),
                  'aria-current': row.id === active ? 'true' : null,
                  onfocus: (event) => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
                  onclick: () => { this.#activeId = row.id; this.#render() },
                },
                  navIcon(row.id),
                  h('span', {class: css.navLabel ?? ''}, row.label),
                )
              )),
            ),
          ),
          h('div', {class: css.content ?? ''},
            h('div', {class: css.header ?? ''},
              h('div', {class: css.actions ?? ''}, asChild(renderSlot('settings.action', {}))),
              h('button', {'data-close-button': '', type: 'button', class: css.close ?? '', onclick: this.#close},
                h(IconCloseOutline16, {size: 14}),
                h('span', {class: css.hiddenLabel ?? ''}, asChild(renderSlot('settings.close', {}))),
              ),
            ),
            h('div', {class: css.options ?? '', onfocusin: (event) => event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })},
              active !== undefined && asChild(renderSlot('settings.section', { close: this.#close }, { only: active })),
            ),
          ),
        ),
      )
    )
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { wide, useSections, useOnboardingSteps, useSessions, renderSlot } = props

    const rows = useSections(s => s)
    const onboardingSteps = useOnboardingSteps(s => s)
    const onboardingActive = useSessions(state =>
      state.phase === 'ready'
      && (state.current === undefined || state.byId[state.current]?.blank === true))

    if (onboardingActive !== this.#lastOnboardingActive) {
      this.#lastOnboardingActive = onboardingActive
      if (!onboardingActive) this.#completedOnboarding = new Set()
    }

    const onboardingStep = onboardingActive
      ? onboardingSteps.find(step => !this.#completedOnboarding.has(step.id))
      : undefined

    const completeOnboardingStep = (id) => {
      if (this.#completedOnboarding.has(id)) return
      this.#completedOnboarding = new Set([...this.#completedOnboarding, id])
      this.#render()
    }

    const vdom = [
      h('button', {
        type: 'button',
        class: clsx(css.trigger, !wide && css.rail),
        'aria-haspopup': 'dialog',
        'aria-expanded': String(this.#open),
        onclick: () => { this.#open = true; this.#render() },
      },
        asChild(renderSlot('settings.trigger', { wide })),
      ),
      ...(this.#open ? [this.#renderPanel(rows, renderSlot)] : []),
      ...(onboardingStep !== undefined
        ? [asChild(renderSlot('settings.onboarding', {
          stepId: onboardingStep.id,
          complete: () => { completeOnboardingStep(onboardingStep.id) },
          openSection: this.#openSection,
        }, { only: onboardingStep.id }))]
        : []),
    ]
    applyDiff(this, vdom)

    if (this.#open) {
      this.#bindEscape()
      if (!this.#closeButtonFocused) {
        this.#closeButtonFocused = true
        this.#returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
        this.querySelector('[data-close-button]')?.focus()
      }
    } else {
      this.#unbindEscape()
      if (this.#closeButtonFocused) {
        this.#closeButtonFocused = false
        this.#returnFocusTo?.focus()
        this.#returnFocusTo = null
      }
    }
  }
}

defineElement('freddie-settings-root', FreddieSettingsRoot)

export function SettingsRoot(props) {
  const el = document.createElement('freddie-settings-root')
  el.setProps(props)
  return el
}
