import { applyDiff, createElement as h } from '@freddie/webjsx'
import { IconChevronDownOutline14, defineElement } from '@freddie/freddie-client-ui-primitives'
import css from './SubagentCard.css.js'

function classes(...names) {
  return names.filter(name => typeof name === 'string' && name.length > 0).join(' ')
}

function LimitField(props) {
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
      inputmode: 'numeric',
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

export class FreddieSubagentCard extends HTMLElement {
  #props = null
  #open = false

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
    const state = props.useSubagentCard(snapshot => snapshot)
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
            h(LimitField, {
              id: 'plugin-config-subagent-depth',
              label: props.t('maxDepth'),
              hint: props.t('maxDepthHint'),
              invalidLabel: props.t('invalidDepth'),
              overriddenLabel: props.t('overridden'),
              resetLabel: props.t('reset'),
              disabled,
              ...state.maxDepth,
              onEdit: (text) => { props.edit('maxDepth', text) },
              onReset: () => { props.resetField('maxDepth') },
            }),
            h(LimitField, {
              id: 'plugin-config-subagent-active',
              label: props.t('maxActiveSubagents'),
              hint: props.t('maxActiveSubagentsHint'),
              invalidLabel: props.t('invalidActive'),
              overriddenLabel: props.t('overridden'),
              resetLabel: props.t('reset'),
              disabled,
              ...state.maxActiveSubagents,
              onEdit: (text) => { props.edit('maxActiveSubagents', text) },
              onReset: () => { props.resetField('maxActiveSubagents') },
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

defineElement('freddie-subagent-card', FreddieSubagentCard)

export function SubagentCard(props) {
  const el = document.createElement('freddie-subagent-card')
  el.setProps(props)
  return el
}
