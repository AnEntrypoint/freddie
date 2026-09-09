/**
 * Plugins settings section: localized tabs around feature-owned pages.
 *
 * Converted from a React hooks component (useState/useEffect/useRef/useId) to
 * a webjsx custom element: activeId/visitedIds become instance fields, the
 * visited-set effect becomes an inline update inside #render, tab button refs
 * become a direct querySelector lookup by index, and re-render is an explicit
 * applyDiff(this, vdom) call (Toast.tsx's pattern). useId's stable id becomes
 * a per-instance counter assigned in the constructor.
 */

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import css from './PluginsSettingsSection.css.js'

/** Cast a renderSlot() RenderOutput result into a webjsx-embeddable child. */
function asChild(node) {
  return node
}

let idCounter = 0

/** Plugins section custom element: tabs whose contents arrive from feature-owned tabs. */
export class FreddiePluginsSettingsSection extends HTMLElement {
  #props = null
  #tabsId = `freddie-plugins-tabs-${String(idCounter++)}`
  #activeId
  #visitedIds = new Set()

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #focusTab(index) {
    const button = this.querySelectorAll('[role="tab"]')[index]
    button?.focus()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { t, renderSlot, useTabs } = props
    const rows = useTabs(value => value)
    const active = rows.find(row => row.id === this.#activeId)?.id ?? rows[0]?.id
    if (active !== undefined && !this.#visitedIds.has(active)) {
      this.#visitedIds = new Set([...this.#visitedIds, active])
    }
    const tabsId = this.#tabsId

    const vdom = (
      h('div', {class: css.section ?? ''},
        h('h2', {class: css.heading ?? ''}, t('title')),
        h('p', {class: css.intro ?? ''}, t('intro')),
        rows.length === 0
          ? h('p', {class: css.empty ?? ''}, t('empty'))
          : [
            h('div', {class: css.tabs ?? '', role: 'tablist', 'aria-label': t('tabs')},
              rows.map((row, index) => {
                const selected = row.id === active
                return (
                  h('button', {
                    key: row.id,
                    id: `${tabsId}-tab-${row.id}`,
                    type: 'button',
                    role: 'tab',
                    class: css.tab ?? '',
                    'aria-selected': selected,
                    'aria-controls': `${tabsId}-panel-${row.id}`,
                    'data-active': selected ? 'true' : undefined,
                    tabindex: selected ? '0' : '-1',
                    onclick: () => { this.#activeId = row.id; this.#render() },
                    onkeydown: (event) => {
                      let nextIndex
                      switch (event.key) {
                        case 'ArrowRight': nextIndex = (index + 1) % rows.length; break
                        case 'ArrowLeft': nextIndex = (index - 1 + rows.length) % rows.length; break
                        case 'Home': nextIndex = 0; break
                        case 'End': nextIndex = rows.length - 1; break
                        default: return
                      }
                      event.preventDefault()
                      const nextRow = rows[nextIndex]
                      this.#activeId = nextRow.id
                      this.#render()
                      this.#focusTab(nextIndex)
                    },
                  },
                    row.label,
                  )
                )
              }),
            ),
            ...rows
              .filter(row => row.id === active || this.#visitedIds.has(row.id))
              .map((row) => {
                const selected = row.id === active
                return (
                  h('div', {
                    key: row.id,
                    id: `${tabsId}-panel-${row.id}`,
                    class: css.panel ?? '',
                    role: 'tabpanel',
                    'aria-labelledby': `${tabsId}-tab-${row.id}`,
                    hidden: !selected,
                  },
                    asChild(renderSlot('settings.plugins.tab', {}, { only: row.id })),
                  )
                )
              }),
          ],
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-plugins-settings-section') === undefined) {
  customElements.define('freddie-plugins-settings-section', FreddiePluginsSettingsSection)
}

/** Render one Plugins page whose contents arrive from feature-owned tabs. */
export function PluginsSettingsSection(props) {
  const el = document.createElement('freddie-plugins-settings-section')
  el.setProps(props)
  return el
}
