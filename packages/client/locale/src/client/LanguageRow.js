/**
 * Language preference row registered into the General section item slot
 * (figma 501:30011 'Setting-Cell'): title + selector pill opening the locale
 * menu. Registered by this package — the locale feature owns its own
 * settings surface.
 */
import { applyDiff, createElement as h } from 'webjsx'
import { IconChevronDownOutline14, renderMenu } from '@freddie/freddie-client-ui-primitives'
import css from './LanguageRow.css.js'

/** Language preference row, as a custom element (owns the menu open state). */
export class FreddieLanguageRow extends HTMLElement {
  #props = null
  #open = false
  #menu = null

  /** Set/replace props and re-render; the owning renderer calls this on every update. */
  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { t, setLocale, useStore } = props
    const active = useStore(s => s.active)
    const options = useStore(s => s.options)
    const activeLabel = options.find(o => o.id === active)?.label ?? active

    const vdom = h('div', {class: css.row ?? ''},
      h('div', {class: css.rowText ?? ''},
        h('div', {class: css.title ?? ''}, t('language.title')),
      ),
      h('span', {'data-language-menu-slot': ''}),
    )
    applyDiff(this, vdom)

    this.#menu = renderMenu(this.#menu, {
      open: this.#open,
      onClose: () => { this.#open = false; this.#render() },
      items: options.map(o => ({ id: o.id, label: o.label })),
      selectedId: active,
      onSelect: (id) => {
        setLocale(id)
        this.#open = false
        this.#render()
      },
      align: 'end',
      portal: true,
      anchor: h('button', {
          type: 'button',
          class: css.selector ?? '',
          'aria-haspopup': 'menu',
          'aria-expanded': String(this.#open),
          onclick: () => { this.#open = !this.#open; this.#render() },
        },
        activeLabel,
        h(IconChevronDownOutline14, {className: css.chevron}),
      ),
    })
    const slot = this.querySelector('[data-language-menu-slot]')
    slot?.replaceWith(this.#menu)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-language-row') === undefined) {
  customElements.define('freddie-language-row', FreddieLanguageRow)
}

/**
 * Render the Language row.
 * @param props - composed slot props.
 * @returns the row element.
 */
export function LanguageRow(props) {
  const el = document.createElement('freddie-language-row')
  el.setProps(props)
  return el
}
