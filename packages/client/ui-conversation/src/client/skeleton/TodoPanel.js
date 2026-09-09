// TodoPanel: plan strip above the composer (the web counterpart of the TUI
// plan panel). Renders the standing todo/write whole-list snapshot (cleared on
// the next turn/start) — no data of its own, hidden while the list is empty.
// Mounted through the 'conversation.input.dock' slot (QueueDock posture): the
// dock adapter does the selecting, so the panel takes the plain list and stays
// framework-free. Visual: figma 772:51905 / 772:52972 / 772:53419.

import { applyDiff, createElement as h } from 'webjsx'
import { IconChecklistOutline14, IconChevronDownOutline14, IconChevronUpOutline14 } from '@freddie/freddie-client-ui-primitives'
import { NS } from '../locales.js'
import css from './TodoPanel.css.js'

/** Local exhaustiveness helper — client packages do not depend on `freddie-llm`. */
/* v8 ignore next 3 -- closed-union backstop; only reached if status is forged */
function assertNever(value) {
  throw new Error(`unreachable todo status: ${String(value)}`)
}

/** Status glyphs share the figma 14×14 artboard; the 16×16 `.glyph` cell centers them. */
function CompletedGlyph() {
  return h(
    'svg',
    { width: '14', height: '14', viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': 'true', class: css.glyphCompleted ?? '' },
    h('circle', { cx: '7', cy: '7', r: '6.4', stroke: 'currentColor', 'stroke-width': '1.2' }),
    h('path', {
      d: 'M10.9631 5.71411L7.70154 8.97571C7.48011 9.19714 7.27736 9.40099 7.09229 9.54993C6.89742 9.70669 6.66314 9.85279 6.3634 9.90027C6.2049 9.92534 6.04339 9.92534 5.88489 9.90027C5.58515 9.85279 5.35087 9.70669 5.15601 9.54993C4.97093 9.40099 4.76818 9.19714 4.54675 8.97571L3.03516 7.46411L3.96313 6.53613L5.47473 8.04773C5.7169 8.28989 5.86196 8.43389 5.97888 8.52795C6.08597 8.61409 6.10875 8.60701 6.08997 8.604C6.11259 8.60758 6.13571 8.60758 6.15833 8.604C6.13954 8.60701 6.16232 8.61409 6.26941 8.52795C6.38633 8.43389 6.53139 8.28989 6.77356 8.04773L10.0352 4.78613L10.9631 5.71411Z',
      fill: 'currentColor',
    }),
  )
}

let gradientSeq = 0

/** In-progress: business-blue ring fading out; CSS spins the svg. */
function ProgressGlyph() {
  gradientSeq += 1
  const gradientId = `todo-progress-${String(gradientSeq)}`
  return h(
    'svg',
    { width: '14', height: '14', viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': 'true', class: css.glyphProgress ?? '' },
    h('defs', null,
      h('linearGradient', { id: gradientId, x1: '2.5', y1: '12', x2: '10.5', y2: '3.5', gradientUnits: 'userSpaceOnUse' },
        h('stop', { 'stop-color': 'currentColor' }),
        h('stop', { offset: '1', 'stop-color': 'currentColor', 'stop-opacity': '0' }),
      ),
    ),
    h('circle', { cx: '7', cy: '7', r: '6.4', stroke: `url(#${gradientId})`, 'stroke-width': '1.2' }),
  )
}

/** Pending: dashed unstarted ring (figma dash 2.4 2.4). */
function PendingGlyph() {
  return h(
    'svg',
    { width: '14', height: '14', viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': 'true', class: css.glyphPending ?? '' },
    h('circle', { cx: '7', cy: '7', r: '6.4', stroke: 'currentColor', 'stroke-width': '1.2', 'stroke-dasharray': '2.4 2.4' }),
  )
}

function StatusGlyph({ status }) {
  switch (status) {
    case 'completed': return h(CompletedGlyph, null)
    case 'in_progress': return h(ProgressGlyph, null)
    case 'pending': return h(PendingGlyph, null)
    /* v8 ignore next -- closed TodoItem status union */
    default: return assertNever(status)
  }
}

/** Header summary: "·"-joined per-status counts; zero-count segments are omitted as noise (a non-empty list keeps at least one). */
function progressLabel(todos, t) {
  const done = todos.filter(item => item.status === 'completed').length
  const active = todos.filter(item => item.status === 'in_progress').length
  const pending = todos.length - done - active
  // En spaces (U+2002): HTML collapses runs of ASCII spaces, so widening the
  // separator breathing room needs a literal wide space.
  return [
    ...done > 0 ? [t('todo.progress.done', { done })] : [],
    ...active > 0 ? [t('todo.progress.active', { active })] : [],
    ...pending > 0 ? [t('todo.progress.pending', { pending })] : [],
  ].join(' · ')
}

/**
 * Plan strip custom element: collapsed/expanded is the only local state.
 * Converted from a React hooks component (useState) to a webjsx custom
 * element with a private field and an explicit #render() (Toast.tsx's
 * pattern).
 */
export class FreddieTodoPanel extends HTMLElement {
  #props = { todos: [], t: (key) => key }
  #collapsed = true

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #render() {
    const { todos, t } = this.#props
    if (todos.length === 0) {
      applyDiff(this, h('section', null))
      return
    }
    const collapsed = this.#collapsed
    const vdom = h(
      'section',
      { class: css.root ?? '', 'data-testid': 'todo-panel', 'aria-label': t('todo.title') },
      h('div', { class: css.body ?? '' },
        h(
          'button',
          {
            type: 'button',
            class: css.header ?? '',
            'aria-expanded': !collapsed,
            onclick: () => { this.#collapsed = !this.#collapsed; this.#render() },
          },
          h('span', { class: css.lead ?? '', 'aria-hidden': true }, h(IconChecklistOutline14, null)),
          h('span', { class: css.title ?? '' }, t('todo.title')),
          h('span', { class: css.progress ?? '' }, progressLabel(todos, t)),
          h('span', { class: css.chevron ?? '', 'aria-hidden': true },
            collapsed ? h(IconChevronUpOutline14, null) : h(IconChevronDownOutline14, null)),
        ),
        !collapsed && h(
          'ul',
          { class: css.list ?? '' },
          todos.map(item => h(
            'li',
            { key: item.content, class: css.item ?? '', 'data-status': item.status },
            h('span', { class: css.glyph ?? '', 'aria-hidden': true }, h(StatusGlyph, { status: item.status })),
            h('span', { class: css.content ?? '' }, item.content),
          )),
        ),
      ),
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-todo-panel') === undefined) {
  customElements.define('freddie-todo-panel', FreddieTodoPanel)
}

/** One-shot creation/update helper preserving the original function-component call shape. */
export function TodoPanel(props) {
  const el = document.createElement('freddie-todo-panel')
  el.setProps(props)
  return el
}

/** Dock adapter: reads the host-computed 'todos' projection (whole list; absent or null renders nothing). */
export function TodoDock({ useProjection, t }) {
  const todos = useProjection('todos')
  return TodoPanel({ todos: todos ?? [], t })
}

/**
 * The plan strip as a plain registrant plugin (QueueDock posture), following
 * the input-dock declaration across independent activation and reload.
 */
export const todoDockEntry = {
  name: 'conversation-todo-dock',
  inject: ['slots'],
  /**
   * Register the plan strip before the goal and queue entries (order 0).
   * @param ctx - registrant context (disposal rides ctx.effect inside slots.register).
   */
  apply(ctx) {
    ctx.slots.inject('conversation.input.dock', () =>
      ctx.slots.register({ name: 'conversation.input.dock', id: 'todo', order: 0, locale: NS }, TodoDock))
  },
}
