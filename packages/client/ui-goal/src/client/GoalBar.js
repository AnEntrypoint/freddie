/**
 * GoalBar: the goal indicator docked above the message composer (input dock
 * strip). A present goal shows a goal glyph, a phase label, the truncated
 * objective, and icon actions — resume when paused, edit (inline form in the
 * same strip), and clear. Goal creation lives on the `/goal` command, not
 * here: loading (undefined), no goal (null), and complete goals render
 * nothing. Live state arrives as the projected whole snapshot; the verbs are
 * the injected face.
 *
 * Converted from a React hooks component to a webjsx custom element:
 * editing/draft/pending/actionError/clearedGoalId become instance fields,
 * the goal-identity reset effect becomes an explicit check in setProps, and
 * re-render is an explicit applyDiff(this, vdom) call (Toast.tsx's pattern).
 */

import { applyDiff, createElement as h } from '@freddie/webjsx'
import {
  IconCheckOutline16, IconCloseOutline16, IconEditOutline16, IconGoalOutline16,
  IconPauseOutline16, IconPlayOutline16, IconTrashOutline16, renderTooltip,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import css from './GoalBar.css.js'

/** Strip label keys per visible phase; complete goals render nothing. */
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

/** Goal indicator strip custom element. */
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

/**
 * Dock adapter custom element: reads the host-computed 'goal' projection
 * (whole value; absent or null renders nothing) and hosts a FreddieGoalBar.
 * Converted from a React hooks component (useProjection subscription) to a
 * webjsx custom element: `useProjection` is read directly inside `#render()`
 * on every `setProps` call (the WebjsxBridge re-invokes `setProps` on every
 * host re-render), matching ui-plan's `FreddiePlanChip` pattern — no separate
 * subscription lifecycle is needed.
 */
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

/**
 * One goal, as FreddieGoalBar reads it: identity for reset/clear tracking,
 * the visible phase, the objective text, and the blocked-phase reason shown
 * as the strip's title.
 * @typedef {object} GoalBarGoal
 * @property {string} id
 * @property {'active'|'paused'|'blocked'|'complete'} phase
 * @property {string} objective
 * @property {{message: string}} [blockedReason]
 */

/**
 * Outcome of a goal action call (edit/pause/resume/clear).
 * @typedef {object} GoalBarActionResult
 * @property {boolean} ok
 * @property {{code: string, message: string, details: object}} [error]
 */

/**
 * Props for the standalone `freddie-goal-bar` element.
 * @typedef {object} GoalBarFullProps
 * @property {GoalBarGoal|null} [goal] - undefined while loading, null when there is no current goal.
 * @property {function(string): Promise<GoalBarActionResult>} onEdit - persist an edited objective.
 * @property {function(): Promise<GoalBarActionResult>} onPause - pause the active goal.
 * @property {function(): Promise<GoalBarActionResult>} onResume - resume a paused goal.
 * @property {function(): Promise<GoalBarActionResult>} onClear - clear the current goal.
 * @property {function(string): string} t - label lookup by key.
 */

/**
 * Create and mount (or update) a GoalBar element for a given goal snapshot.
 * @param el - an existing `freddie-goal-bar` element to update, or null to create one.
 * @param props - see {@link GoalBarFullProps}.
 * @returns the `freddie-goal-bar` element; keep it and pass it back in to update.
 */
export function renderGoalBar(el, props) {
  const target = el ?? document.createElement('freddie-goal-bar')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function GoalBar(props) {
  return renderGoalBar(null, props)
}

/**
 * Props for the `freddie-goal-dock` adapter element: a `goal` projection
 * reader plus the same action/label callbacks GoalBarFullProps takes, passed
 * straight through to the hosted `freddie-goal-bar`.
 * @typedef {object} GoalDockProps
 * @property {function(string): ({goal: GoalBarGoal|null}|null|undefined)} useProjection - reads the named host projection; undefined while loading.
 * @property {function(string): Promise<GoalBarActionResult>} onEdit
 * @property {function(): Promise<GoalBarActionResult>} onPause
 * @property {function(): Promise<GoalBarActionResult>} onResume
 * @property {function(): Promise<GoalBarActionResult>} onClear
 * @property {function(string): string} t
 */

/**
 * Create and mount (or update) a GoalDock element.
 * @param el - an existing `freddie-goal-dock` element to update, or null to create one.
 * @param props - see {@link GoalDockProps}.
 * @returns the `freddie-goal-dock` element; keep it and pass it back in to update.
 */
export function renderGoalDock(el, props) {
  const target = el ?? document.createElement('freddie-goal-dock')
  target.setProps(props)
  return target
}

/** One-shot creation helper preserving the original function-component call shape. */
export function GoalDock(props) {
  return renderGoalDock(null, props)
}
