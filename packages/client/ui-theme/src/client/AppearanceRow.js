// Appearance preference row registered into the General section item slot
// (figma 501:30012 'Frame 2117131228'): title + three preference cubes.
// Registered by this package — the theme feature owns its own settings
// surface. Selection follows the persisted preference, never the resolved
// active theme.
//
// Converted from a React function component to a webjsx custom element: the
// component reads a declared store (`props.useStore`), which is a framework
// hook bound per-instance by the slot renderer — a hook cannot be invoked
// outside a React render. `setProps` therefore calls it once, synchronously,
// to capture the current selected value for `#render()`; the bridge
// (ui-renderer's WebjsxBridge) re-invokes `setProps` whenever its own props
// object changes identity.
import { applyDiff, createElement as h } from 'webjsx'
import {
  IconDarkOutline16, IconFollowsystemOutline16, IconLightOutline16,
} from '@freddie/freddie-client-ui-primitives'
import css from './AppearanceRow.css.js'

/** Cube order and icons (figma 501:30015-30017: Light, Dark, System). */
const CUBES = [
  { id: 'light', labelKey: 'appearance.light', Icon: IconLightOutline16 },
  { id: 'dark', labelKey: 'appearance.dark', Icon: IconDarkOutline16 },
  { id: 'system', labelKey: 'appearance.system', Icon: IconFollowsystemOutline16 },
]

/**
 * Appearance row custom element: title + three preference cubes. Registered
 * as `freddie-theme-appearance-row` via `webjsxSlot` at the slot's register call
 * site (see index.ts), so the slot renderer hosts this element instead of
 * calling a React component directly.
 */
export class FreddieAppearanceRow extends HTMLElement {
  #props = null
  #preference = 'system'

  /** Set/replace props and re-render; called by the slot renderer's webjsx bridge. */
  setProps(props) {
    this.#props = props
    this.#preference = props.useStore(s => s.preference)
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { t, setTheme } = props
    const preference = this.#preference
    const vdom = (
      h('div', {class: css.group ?? ''},
        h('div', {class: css.title ?? ''}, t('appearance.title')),
        h('div', {class: css.cubeRow ?? ''},
          CUBES.map(({ id, labelKey, Icon }) => (
            h('button', {
              type: 'button',
              class: preference === id ? `${css.themeCube ?? ''} ${css.selected ?? ''}` : css.themeCube ?? '',
              'aria-pressed': String(preference === id),
              onclick: () => { setTheme(id) },
            },
              h(Icon, null),
              t(labelKey),
            )
          )),
        ),
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-theme-appearance-row') === undefined) {
  customElements.define('freddie-theme-appearance-row', FreddieAppearanceRow)
}
