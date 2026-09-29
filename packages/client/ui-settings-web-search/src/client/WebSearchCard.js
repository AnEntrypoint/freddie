/**
 * The web-search card: a header naming what the namespace governs, disclosing its
 * endpoint, its per-request budget, and its key in place, with the one save that
 * writes them.
 *
 * The key control is write-only in both directions: it is never pre-filled, and
 * the card reports only whether one is configured. Disclosure is card-local
 * state, and a card renders nothing while its namespace is unavailable.
 */

import { applyDiff, createElement as h } from '@freddie/webjsx'
import { IconChevronDownOutline14, defineElement } from '@freddie/freddie-client-ui-primitives'
import css from './WebSearchCard.css.js'

/** Join the class names that apply, without a class-name library. */
function classes(...names) {
  return names.filter(name => typeof name === 'string' && name.length > 0).join(' ')
}

/**
 * One staged value field. `numeric` only hints the keypad: which drafts a field
 * accepts is decided by its spec, so the control never rewrites what was typed.
 * @param props - the field's copy, its staged text, and the edit actions.
 * @returns the labelled control.
 */
function ValueField(props) {
  return h('div', { class: css.field ?? '' },
    h('div', { class: css.head ?? '' },
      h('label', { class: css.label ?? '', for: props.id }, props.label),
      props.overridden
        ? h('span', { class: css.badges ?? '' },
            h('span', { class: css.badge ?? '' }, props.overriddenLabel),
            h('button', {
              type: 'button',
              class: css.reset ?? '',
              disabled: props.disabled,
              onclick: props.onReset,
            },
              props.resetLabel,
            ),
          )
        : null,
    ),
    h('input', {
      id: props.id,
      class: props.invalid ? css.inputInvalid ?? '' : css.input ?? '',
      type: 'text',
      inputmode: props.numeric ? 'numeric' : undefined,
      'aria-invalid': props.invalid ? true : undefined,
      value: props.text,
      placeholder: props.placeholder ?? '',
      disabled: props.disabled,
      oninput: (event) => { props.onEdit(event.target.value) },
    }),
    h('p', { class: props.invalid ? css.invalid ?? '' : css.hint ?? '' },
      props.invalid ? props.invalidLabel : props.hint,
    ),
  )
}

/**
 * The key control. Its value is what the user typed and nothing else — a stored
 * key is never read back into the input, so the field is empty on every visit
 * and a blank draft writes nothing at all.
 * @param props - the control's copy, its staged text, and the edit action.
 * @returns the labelled control.
 */
function KeyField(props) {
  return h('div', { class: css.field ?? '' },
    h('div', { class: css.head ?? '' },
      h('label', { class: css.label ?? '', for: props.id }, props.label),
    ),
    h('input', {
      id: props.id,
      class: css.input ?? '',
      type: 'password',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      value: props.text,
      placeholder: props.placeholder ?? '',
      disabled: props.disabled,
      oninput: (event) => { props.onEdit(event.target.value) },
    }),
    h('p', { class: css.hint ?? '' },
      props.disabled ? props.readOnlyLabel : props.configured ? props.configuredLabel : props.hint,
    ),
  )
}

/** One web-search card custom element. Disclosure and staged edits are card-local. */
export class FreddieWebSearchCard extends HTMLElement {
  #props = null
  #open = false

  /** Set/replace props and re-render; call after creating or updating the element. */
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
    const state = props.useWebSearchCard(snapshot => snapshot)
    if (!state.available) {
      applyDiff(this, [])
      return
    }
    const open = this.#open
    const title = props.t('title')
    const disabled = !state.writable
    const blocked = !state.dirty || state.invalid || state.saving
    const vdom = h('li', { class: classes(css.card, open && css.cardOpen) },
      h('button', {
        type: 'button',
        class: css.header ?? '',
        'aria-expanded': open,
        'aria-label': `${props.t(open ? 'collapse' : 'expand')}: ${title}`,
        onclick: () => { this.#open = !this.#open; this.#render() },
      },
        h('span', { class: css.headText ?? '' },
          h('span', { class: css.name ?? '' }, title),
          h('span', { class: css.description ?? '' }, props.t('description')),
        ),
        state.dirty ? h('span', { class: css.pending ?? '' }, props.t('unsaved')) : null,
        h(IconChevronDownOutline14, { className: classes(css.chevron, open && css.chevronOpen) }),
      ),
      open
        ? h('div', { class: css.body ?? '' },
            disabled ? h('p', { class: css.readOnly ?? '', role: 'status' }, props.t('readOnly')) : null,
            h(KeyField, {
              id: 'plugin-config-web-search-key',
              label: props.t('key'),
              hint: props.t('keyHint'),
              configuredLabel: props.t('keyConfigured'),
              readOnlyLabel: props.t('keyReadOnly'),
              disabled: disabled || !state.key.writable,
              configured: state.key.configured,
              text: state.key.text,
              onEdit: (text) => { props.edit('apiKey', text) },
            }),
            h(ValueField, {
              id: 'plugin-config-web-search-endpoint',
              label: props.t('endpoint'),
              hint: props.t('endpointHint'),
              invalidLabel: props.t('invalidEndpoint'),
              overriddenLabel: props.t('overridden'),
              resetLabel: props.t('reset'),
              disabled,
              ...state.baseURL,
              onEdit: (text) => { props.edit('baseURL', text) },
              onReset: () => { props.resetField('baseURL') },
            }),
            h(ValueField, {
              id: 'plugin-config-web-search-budget',
              label: props.t('budget'),
              hint: props.t('budgetHint'),
              invalidLabel: props.t('invalidBudget'),
              overriddenLabel: props.t('overridden'),
              resetLabel: props.t('reset'),
              numeric: true,
              disabled,
              ...state.maxUses,
              onEdit: (text) => { props.edit('maxUses', text) },
              onReset: () => { props.resetField('maxUses') },
            }),
            h('div', { class: css.footer ?? '' },
              state.failed ? h('p', { class: css.failed ?? '', role: 'status' }, props.t('saveFailed')) : null,
              h('button', {
                type: 'button',
                class: css.discard ?? '',
                disabled: !state.dirty || state.saving,
                onclick: props.discard,
              },
                props.t('discard'),
              ),
              h('button', {
                type: 'button',
                class: css.save ?? '',
                disabled: blocked,
                onclick: props.save,
              },
                props.t(state.saving ? 'saving' : 'save'),
              ),
            ),
          )
        : null,
    )
    applyDiff(this, vdom)
  }
}

defineElement('freddie-web-search-card', FreddieWebSearchCard)

/**
 * Render the web-search card.
 * @param props - locale copy, the card snapshot, and its form actions.
 * @returns the card; renders nothing when the namespace is unavailable.
 */
export function WebSearchCard(props) {
  const el = document.createElement('freddie-web-search-card')
  el.setProps(props)
  return el
}
