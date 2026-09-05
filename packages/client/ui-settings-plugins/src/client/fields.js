/**
 * Hand-written controls for the plugin configuration forms. Each renders one
 * field's label, its staged text, whether saving would leave an override, and
 * — when one stands — the reset that stages a clear back to the composition
 * layer. Nothing here writes: a control reports what the user typed, and the
 * card's save is the single point where a draft becomes a document mutation.
 */

import { createElement as h, Fragment } from 'webjsx'
import css from './fields.css.js'

/**
 * A staged value field. `numeric` only hints the keypad: which drafts a field
 * accepts is decided by its spec, so the control never silently rewrites what
 * the user typed.
 * @param props - the field's copy, its staged text, and the edit actions.
 * @returns the labelled control.
 */
export function ValueField(props) {
  return (
    h('div', {class: css.field ?? ''},
      h('div', {class: css.head ?? ''},
        h('label', {class: css.label ?? '', for: props.id}, props.label),
        props.overridden
          ? (
            h('span', {class: css.badges ?? ''},
              h('span', {class: css.badge ?? ''}, props.overriddenLabel),
              h('button', {
                type: 'button',
                class: css.reset ?? '',
                disabled: props.disabled,
                onclick: props.onReset,
              },
                props.resetLabel,
              ),
            )
          )
          : null,
      ),
      h('input', {
        id: props.id,
        class: props.invalid ? css.inputInvalid ?? '' : css.input ?? '',
        type: 'text',
        inputmode: props.numeric === true ? 'numeric' : undefined,
        'aria-invalid': props.invalid ? true : undefined,
        value: props.text,
        placeholder: props.placeholder ?? '',
        disabled: props.disabled,
        oninput: (event) => { props.onEdit((event.target).value) },
      }),
      h('p', {class: props.invalid ? css.invalid ?? '' : css.hint ?? ''},
        props.invalid ? props.invalidLabel : props.hint,
      ),
    )
  )
}

/**
 * A write-only credential control. The value never rides a response, so the
 * control reports only whether one is configured and starts blank; a blank
 * draft writes nothing, which keeps the stored key rather than clearing it.
 * @param props - the field's copy, its staged text, and the configured state.
 * @returns the labelled control.
 */
export function SecretField(props) {
  return (
    h('div', {class: css.field ?? ''},
      h('div', {class: css.head ?? ''},
        h('label', {class: css.label ?? '', for: props.id}, props.label),
        h('span', {class: css.badges ?? ''},
          h('span', {class: props.configured ? css.badge ?? '' : css.badgeMuted ?? ''}, props.stateLabel),
        ),
      ),
      h('input', {
        id: props.id,
        class: css.input ?? '',
        type: 'password',
        autocomplete: 'off',
        value: props.text,
        disabled: props.disabled,
        oninput: (event) => { props.onEdit((event.target).value) },
      }),
      h('p', {class: css.hint ?? ''}, props.hint),
    )
  )
}
