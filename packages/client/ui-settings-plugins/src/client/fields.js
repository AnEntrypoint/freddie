import { createElement as h, Fragment } from '@freddie/webjsx'
import css from './fields.css.js'

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
