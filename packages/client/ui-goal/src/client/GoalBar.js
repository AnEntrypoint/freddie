import { applyDiff, createElement as h } from '@freddie/webjsx'
import {
  IconCheckOutline16, IconCloseOutline16, IconEditOutline16, IconGoalOutline16,
  IconPauseOutline16, IconPlayOutline16, IconTrashOutline16, renderTooltip,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import css from './GoalBar.css.js'

const PHASE_LABELS = {
  active: 'phase.active',
  paused: 'phase.paused',
  blocked: 'phase.blocked',
}

const DEFAULT_PROPS = {
  goal: undefined,
  onEdit: async () => ({ ok: false, error: { code: 'no-current-goal', message: '', details: {} } }),
  onPause: async () => ({ ok: false, error: { code: 'no-current-goal', message: '', details: {} } }),
  onResume: async () => ({ ok: false, error: { code: 'no-current-goal', message: '', details: {} } }),
  onClear: async () => ({ ok: false, error: { code: 'no-current-goal', message: '', details: {} } }),
  t: (key) => key,
}

export class FreddieGoalBar extends HTMLElement {
  #props = DEFAULT_PROPS
  #editing = false
  #draft = ''
  #pending = false
  #pendingFlag = false
  #actionError = null
  #clearedGoalId = null
  #tooltipByCallSite = new Map()

  #persistentTooltip(key, props, ...children) {
    const el = renderTooltip(this.#tooltipByCallSite.get(key) ?? null, { ...props, children })
    this.#tooltipByCallSite.set(key, el)
    return el
  }

  setProps(props) {
    const prevGoalId = this.#props.goal?.id
    this.#props = props
    if (props.goal?.id !== prevGoalId) this.#discardStateOfPreviousGoal()
    this.#render()
  }

  #discardStateOfPreviousGoal() {
    this.#editing = false
    this.#actionError = null
    this.#clearedGoalId = null
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {}

  async #runAction(action) {
    if (this.#pendingFlag) return undefined
    this.#pendingFlag = true
    this.#pending = true
    this.#actionError = null
    const result = await action()
    this.#pendingFlag = false
    this.#pending = false
    if (!result.ok) this.#actionError = `${result.error.message} (${result.error.code})`
    this.#render()
    return result
  }

  async #handleEdit() {
    const trimmed = this.#draft.trim()
    if (trimmed === '') return
    const result = await this.#runAction(() => this.#props.onEdit(trimmed))
    if (result?.ok) { this.#editing = false; this.#render() }
  }

  async #handleClear(clearedId) {
    const result = await this.#runAction(this.#props.onClear)
    if (result?.ok) { this.#clearedGoalId = clearedId; this.#render() }
  }

  #render() {
    const { goal, onPause, onResume, t } = this.#props

    if (goal === undefined || goal === null || goal.phase === 'complete' || goal.id === this.#clearedGoalId) {
      applyDiff(this, [])
      return
    }

    if (this.#editing) {
      const vdom = (
        h('div', {class: css.dock ?? '', 'data-goal-bar': ''},
          h('div', {class: css.bar ?? ''},
            h('input', {
              class: css.objectiveInput ?? '',
              type: 'text',
              'aria-label': t('objective.aria'),
              value: this.#draft,
              oninput: (e) => {
                this.#draft = (e.target).value
              },
              onkeydown: (e) => {
                if (e.key === 'Enter') void this.#handleEdit()
                if (e.key === 'Escape') { this.#editing = false; this.#render() }
              },
              autofocus: true,
            }),
            this.#actionError !== null && h('span', {class: css.error ?? '', role: 'alert'}, this.#actionError),
            h('div', {class: css.actions ?? ''},
              this.#persistentTooltip('save', {label: t('action.save'), side: 'bottom', delayMs: 500},
                h('button', {
                  type: 'button',
                  class: css.iconBtn ?? '',
                  onclick: () => { void this.#handleEdit() },
                  disabled: this.#pending || this.#draft.trim() === '',
                  'aria-label': t('action.save'),
                },
                  h(IconCheckOutline16, {size: 14}),
                ),
              ),
              this.#persistentTooltip('cancel', {label: t('action.cancel'), side: 'bottom', delayMs: 500},
                h('button', {
                  type: 'button',
                  class: css.iconBtn ?? '',
                  onclick: () => { this.#editing = false; this.#render() },
                  disabled: this.#pending,
                  'aria-label': t('action.cancel'),
                },
                  h(IconCloseOutline16, {size: 14}),
                ),
              ),
            ),
          ),
        )
      )
      applyDiff(this, vdom)
      return
    }

    const title = goal.phase === 'blocked' ? goal.blockedReason?.message : undefined
    const vdom = (
      h('div', {class: css.dock ?? '', 'data-goal-bar': ''},
        h('div', {class: css.bar ?? '', title: title},
          h('span', {class: css.goalGlyph ?? ''}, h(IconGoalOutline16, {size: 14})),
          h('span', {class: css.label ?? ''}, t(PHASE_LABELS[goal.phase])),
          h('span', {class: css.objective ?? ''}, goal.objective),
          this.#actionError !== null && h('span', {class: css.error ?? '', role: 'alert'}, this.#actionError),
          h('div', {class: css.actions ?? ''},
            goal.phase === 'active' && (
              this.#persistentTooltip('pause', {label: t('action.pause'), side: 'bottom', delayMs: 500},
                h('button', {type: 'button', class: css.iconBtn ?? '', disabled: this.#pending, onclick: () => { void this.#runAction(onPause) }, 'aria-label': t('action.pause')},
                  h(IconPauseOutline16, {size: 14}),
                ),
              )
            ),
            goal.phase === 'paused' && (
              this.#persistentTooltip('resume', {label: t('action.resume'), side: 'bottom', delayMs: 500},
                h('button', {type: 'button', class: css.iconBtn ?? '', disabled: this.#pending, onclick: () => { void this.#runAction(onResume) }, 'aria-label': t('action.resume')},
                  h(IconPlayOutline16, {size: 14}),
                ),
              )
            ),
            this.#persistentTooltip('edit', {label: t('action.edit'), side: 'bottom', delayMs: 500},
              h('button', {
                type: 'button',
                class: css.iconBtn ?? '',
                disabled: this.#pending,
                onclick: () => { this.#draft = goal.objective; this.#editing = true; this.#render() },
                'aria-label': t('action.edit'),
              },
                h(IconEditOutline16, {size: 14}),
              ),
            ),
            this.#persistentTooltip('clear', {label: t('action.clear'), side: 'bottom', delayMs: 500},
              h('button', {type: 'button', class: css.iconBtn ?? '', disabled: this.#pending, onclick: () => { void this.#handleClear(goal.id) }, 'aria-label': t('action.clear')},
                h(IconTrashOutline16, {size: 14}),
              ),
            ),
          ),
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-goal-bar', FreddieGoalBar)

export class FreddieGoalDock extends HTMLElement {
  #props = null
  #bar = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {}

  #render() {
    const props = this.#props
    if (props === null) return
    const { useProjection, onEdit, onPause, onResume, onClear, t } = props
    const projection = useProjection('goal')
    const goal = projection === undefined ? undefined : projection === null ? null : projection.goal

    if (this.#bar === null) {
      this.#bar = document.createElement('freddie-goal-bar')
      this.appendChild(this.#bar)
    }
    this.#bar.setProps({ goal, onEdit, onPause, onResume, onClear, t })
  }
}

defineElement('freddie-goal-dock', FreddieGoalDock)

export function renderGoalBar(el, props) {
  const target = el ?? document.createElement('freddie-goal-bar')
  target.setProps(props)
  return target
}

export function GoalBar(props) {
  return renderGoalBar(null, props)
}

export function renderGoalDock(el, props) {
  const target = el ?? document.createElement('freddie-goal-dock')
  target.setProps(props)
  return target
}

export function GoalDock(props) {
  return renderGoalDock(null, props)
}
