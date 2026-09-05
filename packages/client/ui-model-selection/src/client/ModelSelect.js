/**
 * ModelSelect: the composer's named model seat (`conversation.input.model`).
 * Two-level selection per figma 496:26454's MenuDropdown: the root menu is
 * the Model / Effort row pair (label + current value + a right chevron),
 * each drilling into its own list — the provider-grouped model list over
 * the shared directory, and the effort levels. The trigger (313:14108's
 * ToggleButton) shows both: model name + effort in the caption tone.
 * Data and submission ride the SAME per-session ModelDirectory as the
 * /model popup; exact-model reasoning metadata and the selected effort come
 * from the Host rather than a client-owned vocabulary. A rejected selection
 * announces through the shared transient Toast anchored to the composer
 * card; the in-menu strip with Retry remains the catalog-load surface.
 *
 * Converted from a React hooks component to a webjsx custom element: every
 * useState/useRef becomes a private instance field, useSyncExternalStore
 * over `directory` becomes a direct store subscription bound in
 * connectedCallback, the outside-click useEffect becomes bind/unbind helpers
 * called from connectedCallback/disconnectedCallback, and re-render is an
 * explicit applyDiff(this, vdom) call (Toast.tsx's pattern).
 */
import { applyDiff, createElement as h, Fragment } from 'webjsx'
import clsx from 'clsx'
import {
  IconCheckOutline16, IconChevronDownOutline14, IconChevronRightOutline14,
  IconWarningOutline16, mountToast,
} from '@freddie/freddie-client-ui-primitives'
import css from './ModelSelect.css.js'

let nextId = 0

/** Render the composer model seat as a custom element. */
export class FreddieModelSelect extends HTMLElement {
  #props = null
  #open = false
  #pane = 'root'
  #lastAction = 'load'
  #toast = null
  #toastSeq = 0
  #toastEl = null
  #rootEl = null
  #triggerEl = null
  #itemEls = []
  #id = `freddie-model-select-${++nextId}`
  #unsubscribe = null
  #outsideHandler = null
  #loadedOnce = false

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    const prevDirectory = this.#props?.directory
    this.#props = props
    if (prevDirectory !== props.directory) {
      this.#bindStore()
      // A directory swap (session switch) needs its own fresh load, same as
      // first mount -- #loadedOnce previously only ever cleared at construction,
      // so a switch back to an already-visited session's directory instance
      // never reloaded, and a genuinely new directory shared its "already
      // loaded" flag with whichever directory happened to load first.
      this.#loadedOnce = false
    }
    // Mount-time load resolves the trigger label; this fires once per
    // directory identity (mirrors the original's [available, load] effect).
    if (!this.#loadedOnce && props.available) {
      this.#loadedOnce = true
      props.load()
    }
    this.#render()
  }

  connectedCallback() {
    this.#bindStore()
    this.#render()
  }

  disconnectedCallback() {
    this.#unsubscribe?.()
    this.#unsubscribe = null
    this.#unbindOutsideClose()
    this.#toastEl?.remove()
    this.#toastEl = null
  }

  #bindStore() {
    this.#unsubscribe?.()
    this.#unsubscribe = null
    const directory = this.#props?.directory
    if (directory === undefined) return
    this.#unsubscribe = directory.subscribe(() => { this.#render() })
  }

  #bindOutsideClose() {
    this.#unbindOutsideClose()
    const closeOutside = (event) => {
      if (!this.#rootEl?.contains(event.target)) {
        this.#open = false
        this.#render()
      }
    }
    this.#outsideHandler = closeOutside
    document.addEventListener('mousedown', closeOutside)
  }

  #unbindOutsideClose() {
    if (this.#outsideHandler === null) return
    document.removeEventListener('mousedown', this.#outsideHandler)
    this.#outsideHandler = null
  }

  #reload() {
    this.#lastAction = 'load'
    this.#props?.load()
  }

  #show() {
    this.#pane = 'root'
    this.#open = true
    this.#bindOutsideClose()
    this.#reload()
    this.#render()
  }

  #close(restoreFocus = false) {
    this.#open = false
    this.#pane = 'root'
    this.#unbindOutsideClose()
    if (restoreFocus) queueMicrotask(() => { this.#triggerEl?.focus() })
    this.#render()
  }

  #moveFocus(offset) {
    const items = this.#itemEls.filter(item => item !== null)
    if (items.length === 0) return
    const active = items.findIndex(item => item === document.activeElement)
    const next = (Math.max(active, 0) + offset + items.length) % items.length
    items[next]?.focus()
  }

  #onRootKeyDown(event) {
    if (event.key === 'Escape' && this.#open) {
      event.preventDefault()
      // Escape backs out of a drilled pane first, then closes.
      if (this.#pane !== 'root') { this.#pane = 'root'; this.#render() } else this.#close(true)
      return
    }
    if (!this.#open) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      this.#moveFocus(event.key === 'ArrowDown' ? 1 : -1)
    }
  }

  #onBlur(event) {
    if (event.relatedTarget instanceof Node && this.#rootEl?.contains(event.relatedTarget)) return
    this.#close()
  }

  #settleSelection(state, accepted) {
    if (accepted) {
      if (this.#rootEl !== null) this.#close(true)
      return
    }
    const message = state.error
    if (message !== null) {
      this.#toastSeq += 1
      const t = this.#props?.t
      this.#toast = { seq: this.#toastSeq, text: t !== undefined ? t('error.action', { message }) : message }
      this.#render()
    }
  }

  #choose(state, selection) {
    const props = this.#props
    if (props === null) return
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      this.#close(true)
      return
    }
    this.#lastAction = 'select'
    void props.select(selection).then((accepted) => {
      this.#settleSelection(props.directory.getSnapshot(), accepted)
    })
  }

  #chooseEffort(state, effectiveEffort, effort) {
    const props = this.#props
    if (props === null || state.current === null) return
    if (effectiveEffort === effort) {
      this.#close(true)
      return
    }
    const selection = {
      provider: state.current.provider,
      model: state.current.model,
      ...effort === undefined ? {} : { reasoningEffort: effort },
    }
    this.#lastAction = 'select'
    void props.select(selection).then((accepted) => {
      this.#settleSelection(props.directory.getSnapshot(), accepted)
    })
  }

  #render() {
    const props = this.#props
    if (props === null) { applyDiff(this, []); return }
    const { locked, available, directory, t } = props
    if (!available) { applyDiff(this, []); return }
    const state = directory.getSnapshot()

    const choices = state.groups.flatMap(group =>
      group.models.map(model => ({
        group,
        model,
        selection: {
          provider: group.id,
          model: model.id,
          ...model.reasoning?.defaultEffort === undefined
            ? {}
            : { reasoningEffort: model.reasoning.defaultEffort },
        },
      })))
    const selectedIndex = state.current === null
      ? -1
      : choices.findIndex(c => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)
    const currentChoice = choices[selectedIndex]
    const reasoning = currentChoice?.model.reasoning
    const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
    const effortLabel = reasoning === undefined
      ? undefined
      : effectiveEffort === undefined
        ? t('effort.providerDefault')
        : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
    const effortChoices = reasoning === undefined
      ? []
      : [
        ...reasoning.defaultEffort === undefined
          ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }]
          : [],
        ...reasoning.efforts.map((effort) => ({
          key: `effort:${effort.id}`,
          effort: effort.id,
          label: effort.name,
          ...effort.description === undefined ? {} : { description: effort.description },
        })),
      ]
    const busy = state.status === 'selecting'

    const modelLabel = currentChoice?.model.name ?? t('trigger.fallback')
    const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`
    const triggerAria = currentChoice === undefined
      ? t('trigger.selectAria')
      : effortLabel === undefined
        ? t('trigger.aria', { model: modelLabel })
        : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel })
    this.#itemEls = []
    let itemIndex = 0
    const itemRef = () => {
      const at = itemIndex++
      return (node) => { this.#itemEls[at] = node }
    }

    const open = this.#open
    const pane = this.#pane
    const id = this.#id

    const vdom = h('div',
      {
        class: css.root ?? '',
        onkeydown: (event) => { this.#onRootKeyDown(event) },
        onblur: (event) => { this.#onBlur(event) },
        ref: (node) => { this.#rootEl = node },
      },
      h('button',
        {
          type: 'button',
          class: css.trigger ?? '',
          'aria-label': triggerAria,
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          'aria-controls': open ? `${id}-menu` : undefined,
          title: triggerLabel,
          disabled: locked,
          ref: (node) => { this.#triggerEl = node },
          onclick: () => {
            if (open) this.#close()
            else this.#show()
          },
        },
        h('span', { class: css.triggerLabel ?? '' }, modelLabel),
        effortLabel !== undefined && h('span', { class: css.triggerEffort ?? '' }, effortLabel),
        h(IconChevronDownOutline14, { className: clsx(css.chevron, open && css.chevronOpen) }),
      ),

      open && (
        h('div',
          {
            id: `${id}-menu`,
            class: css.menu ?? '',
            role: 'menu',
            'aria-label': t('menu.aria'),
            'aria-busy': state.status === 'loading' || busy,
          },
          pane === 'root' && [
            h('button', { ref: itemRef(), type: 'button', role: 'menuitem', class: css.cell ?? '', onclick: () => { this.#pane = 'model'; this.#render() } },
              h('span', { class: css.cellLabel ?? '' }, t('menu.model')),
              h('span', { class: css.cellValue ?? '' }, modelLabel),
              h(IconChevronRightOutline14, { className: css.cellChevron }),
            ),
            reasoning !== undefined && (
              h('button', { ref: itemRef(), type: 'button', role: 'menuitem', class: css.cell ?? '', onclick: () => { this.#pane = 'effort'; this.#render() } },
                h('span', { class: css.cellLabel ?? '' }, t('menu.effort')),
                h('span', { class: css.cellValue ?? '' }, effortLabel),
                h(IconChevronRightOutline14, { className: css.cellChevron }),
              )
            ),
          ],

          pane === 'model' && [
            state.status === 'loading' && (
              h('div', { class: css.status ?? '' }, t('status.loading'))
            ),
            state.error !== null && this.#lastAction === 'load' && (
              h('div', { class: css.error ?? '' },
                h('span', null, t('error.action', { message: state.error })),
                h('button', { type: 'button', class: css.retry ?? '', onclick: () => { this.#reload() } }, t('retry')),
              )
            ),
            ...state.failures.map(failure => (
              h('div', { class: css.warning ?? '', key: failure.id },
                h('span', null, t('warning.groupLoad', { name: failure.name, message: failure.message })),
                h('button', { type: 'button', class: css.retry ?? '', onclick: () => { this.#reload() } }, t('retry')),
              )
            )),
            h('div', { class: clsx(css.groups, 'scrollable') },
              state.groups.map((group) => {
                const headingId = `${id}-${group.id}`
                return (
                  h('section', { role: 'group', 'aria-labelledby': headingId, class: css.group ?? '', key: group.id },
                    h('div', { class: css.groupTitle ?? '', id: headingId }, group.name),
                    group.models.map((model) => {
                      const selected = state.current?.provider === group.id && state.current.model === model.id
                      return (
                        h('button',
                          {
                            ref: itemRef(),
                            type: 'button',
                            role: 'menuitemradio',
                            'aria-checked': selected,
                            class: clsx(css.option, selected && css.selected),
                            key: model.id,
                            title: model.name,
                            disabled: busy,
                            onclick: () => { this.#choose(state, { provider: group.id, model: model.id }) },
                          },
                          h('span', { class: css.optionCopy ?? '' },
                            h('span', { class: css.modelName ?? '' }, model.name),
                            model.description !== undefined && (
                              h('span', { class: css.description ?? '' }, model.description)
                            ),
                          ),
                          h('span', { class: css.check ?? '' },
                            selected ? h(IconCheckOutline16, null) : null,
                          ),
                        )
                      )
                    }),
                  )
                )
              }),
            ),
            state.status === 'ready' && choices.length === 0 && (
              h('div', { class: css.empty ?? '' }, t('empty.models'))
            ),
          ],

          pane === 'effort' && [
            state.error !== null && this.#lastAction === 'load' && (
              h('div', { class: css.error ?? '' },
                h('span', null, t('error.action', { message: state.error })),
                h('button', { type: 'button', class: css.retry ?? '', onclick: () => { this.#reload() } }, t('action.reload')),
              )
            ),
            effortChoices.length === 0
              ? h('div', { class: css.empty ?? '' }, t('empty.efforts'))
              : effortChoices.map(level => (
                h('button',
                  {
                    ref: itemRef(),
                    type: 'button',
                    role: 'menuitemradio',
                    'aria-checked': effectiveEffort === level.effort,
                    class: clsx(css.option, effectiveEffort === level.effort && css.selected),
                    key: level.key,
                    disabled: busy,
                    onclick: () => { this.#chooseEffort(state, effectiveEffort, level.effort) },
                  },
                  h('span', { class: css.optionCopy ?? '' },
                    h('span', { class: css.modelName ?? '' }, level.label),
                    level.description !== undefined && (
                      h('span', { class: css.description ?? '' }, level.description)
                    ),
                  ),
                  h('span', { class: css.check ?? '' },
                    effectiveEffort === level.effort ? h(IconCheckOutline16, null) : null,
                  ),
                )
              )),
          ],
        )
      ),
    )
    applyDiff(this, vdom)
    this.#syncToast()
  }

  #syncToast() {
    if (this.#toast === null) {
      this.#toastEl?.remove()
      this.#toastEl = null
      return
    }
    this.#toastEl?.remove()
    this.#toastEl = mountToast({
      text: this.#toast.text,
      icon: h(IconWarningOutline16, null),
      anchor: this.#rootEl?.closest('[data-composer-card]') ?? null,
      onDone: () => { this.#toast = null; this.#render() },
    })
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-model-select') === undefined) {
  customElements.define('freddie-model-select', FreddieModelSelect)
}

/** One-shot creation helper preserving the original function-component call shape. */
export function ModelSelect(props) {
  const el = document.createElement('freddie-model-select')
  el.setProps(props)
  return el
}
