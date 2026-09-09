/**
 * The agent-preset chip on the new-session screen, beside the workspace
 * picker.
 *
 * It lives here rather than in the composer because the choice is only
 * available before a conversation starts: once a turn has run, the session's
 * history was produced under that preset's tools and the host refuses to swap
 * them. A control that spends most of its life disabled belongs on the screen
 * where it still works.
 *
 * The menu opens on the staged choice, which starts as the deployment default.
 * Picking stages; the choice reaches a session when one becomes current.
 */

import { applyDiff, createElement as h, Fragment } from 'webjsx'
import { IconAgentPresetOutline16, IconChevronDownOutline14, renderMenu } from '@freddie/freddie-client-ui-primitives'
import { presetDisplayText } from './locales.js'
import css from './AgentPresetSeat.css.js'

/* Introduce timeline: the icon eases in first (the CSS animation shares this
   duration); the name's characters start fading up the moment it lands, each
   taking the fade duration to settle. The cue clears after the last one. The
   stagger is capped twice: per tick for short CJK names, and by one shared
   reveal window so a long Latin name finishes in the same time as its CJK
   counterpart instead of dragging the run out per character. */
const INTRO_TEXT_DELAY_MS = 150
const INTRO_CHAR_STAGGER_MS = 40
const INTRO_TEXT_REVEAL_MS = 200
const INTRO_CHAR_FADE_MS = 400

/**
 * Per-character start offset for the introduce reveal.
 * @param count - character count of the shown preset name.
 * @returns milliseconds between successive character starts.
 */
function introStaggerMs(count) {
  if (count <= 1) return 0
  return Math.min(INTRO_CHAR_STAGGER_MS, INTRO_TEXT_REVEAL_MS / (count - 1))
}

/** New-session agent-preset chip, as a custom element. */
export class FreddieAgentPresetSeat extends HTMLElement {
  #props = null
  #open = false
  #loaded = false
  #introducing = false
  #introTimer = null
  #introArmedFor
  #menu = null

  /** Set/replace props and re-render; the owning renderer calls this on every update. */
  setProps(props) {
    this.#props = props
    if (!this.#loaded) {
      this.#loaded = true
      void props.load()
    }
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#clearIntroTimer()
  }

  #clearIntroTimer() {
    if (this.#introTimer !== null) { clearTimeout(this.#introTimer); this.#introTimer = null }
  }

  // The introduce cue: the pick was staged from another screen (the settings
  // creator entry), so the chip announces it — the icon eases in and each
  // character of the name fades up on a stagger (CSS owns the motion; this
  // method only arms it and acknowledges the cue once the run is over).
  #maybeArmIntro(state, label, ready) {
    const props = this.#props
    if (props === null) return
    const armKey = `${String(state.introduce)}:${label}:${String(ready)}`
    if (armKey === this.#introArmedFor) return
    this.#introArmedFor = armKey
    if (!state.introduce || !ready) return
    const characters = Array.from(label)
    if (characters.length === 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      props.introduced()
      return
    }
    this.#introducing = true
    this.#clearIntroTimer()
    this.#introTimer = setTimeout(() => {
      this.#introTimer = null
      this.#introducing = false
      props.introduced()
      this.#render()
    }, INTRO_TEXT_DELAY_MS + (characters.length - 1) * introStaggerMs(characters.length) + INTRO_CHAR_FADE_MS)
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { select, useAgentPresetSeat, t } = props
    const state = useAgentPresetSeat(snapshot => snapshot)

    const chosen = state.options.find(option => option.id === state.current)
    const chosenText = chosen === undefined ? undefined : presetDisplayText(chosen, t)
    const label = chosenText?.name ?? state.current
    const ready = state.options.length > 0 && state.current !== ''

    this.#maybeArmIntro(state, label, ready)

    // Nothing to choose between: the deployment composes no presets and every
    // session shares the host composition.
    if (!ready) {
      applyDiff(this, h('span', {style: 'display:none'}))
      return
    }

    // One wrapper span: the chip is a flex row with a gap, so loose character
    // spans would each pick up the gap between them.
    const characters = Array.from(label)
    const stagger = introStaggerMs(characters.length)
    const shownLabel = this.#introducing
      ? (
        h('span', {class: css.introText ?? ''},
          characters.map((character, index) => (
            h('span', {
              key: index,
              class: css.introChar ?? '',
              style: `animation-delay: ${INTRO_TEXT_DELAY_MS + index * stagger}ms`,
            },
              character,
            )
          )),
        )
      )
      : label

    this.#menu = renderMenu(this.#menu, {
      open: this.#open,
      onClose: () => { this.#open = false; this.#render() },
      items: state.options.map((option) => {
        const text = presetDisplayText(option, t)
        return {
          id: option.id,
          // Name and description together: the id alone never says what a
          // preset does, which is why the roster carries display copy.
          label: (
            h('span', {class: css.item ?? ''},
              h('span', {class: css.itemName ?? ''}, text.name),
              h('span', {class: css.itemDesc ?? ''}, text.description ?? t('noDescription')),
            )
          ),
        }
      }),
      selectedId: state.current,
      onSelect: (id) => {
        this.#open = false
        this.#render()
        void select(id)
      },
      align: 'start',
      portal: true,
      anchor: (
        h('button', {
          type: 'button',
          class: css.seat ?? '',
          'aria-haspopup': 'menu',
          'aria-expanded': String(this.#open),
          title: state.error ?? t('seatHint'),
          disabled: state.busy,
          onclick: () => { this.#open = !this.#open; this.#render() },
        },
          h(IconAgentPresetOutline16, {className: this.#introducing ? `${css.seatIcon} ${css.introIcon}` : css.seatIcon}),
          shownLabel,
          h(IconChevronDownOutline14, {className: css.chevron}),
        )
      ),
    })
    if (this.firstChild !== this.#menu) this.replaceChildren(this.#menu)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-agent-preset-seat') === undefined) {
  customElements.define('freddie-agent-preset-seat', FreddieAgentPresetSeat)
}

/**
 * Render the new-session agent-preset chip.
 * @param props - composed slot props.
 * @returns the chip element.
 */
export function AgentPresetSeat(props) {
  const el = document.createElement('freddie-agent-preset-seat')
  el.setProps(props)
  return el
}
