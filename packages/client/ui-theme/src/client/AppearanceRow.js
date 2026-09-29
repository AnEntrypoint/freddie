import { applyDiff, createElement as h } from '@freddie/webjsx'
import {
  IconDarkOutline16, IconFollowsystemOutline16, IconLightOutline16,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import css from './AppearanceRow.css.js'

const CUBES = [
  { id: 'light', labelKey: 'appearance.light', Icon: IconLightOutline16 },
  { id: 'dark', labelKey: 'appearance.dark', Icon: IconDarkOutline16 },
  { id: 'system', labelKey: 'appearance.system', Icon: IconFollowsystemOutline16 },
]

export class FreddieAppearanceRow extends HTMLElement {
  #props = null
  #preference = 'system'

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

defineElement('freddie-theme-appearance-row', FreddieAppearanceRow)
