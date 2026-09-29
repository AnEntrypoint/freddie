
import { IconChevronDownOutline14, renderMenu } from '@freddie/freddie-client-ui-primitives'
import { presetDisplayText } from './locales.js'
import { createElement as h, Fragment } from '@freddie/webjsx'

export function renderPresetMenu(el, {
  options, selectedId, label, t, buttonClassName, chevronClassName,
  disabled, open, onOpenChange, onSelect,
}) {
  return renderMenu(el, {
    open,
    onClose: () => { onOpenChange(false) },
    items: options.map((option) => {
      const name = presetDisplayText(option, t).name
      return {
        id: option.id,
        label: option.trust === 'user' ? `${name} · ${t('userTrust')}` : name,
      }
    }),
    selectedId,
    onSelect: (id) => {
      onOpenChange(false)
      onSelect(id)
    },
    align: 'end',
    portal: true,
    anchor: (
      h('button', {
        type: 'button',
        class: buttonClassName ?? '',
        'aria-haspopup': 'menu',
        'aria-expanded': String(open),
        disabled: disabled,
        onclick: () => { onOpenChange(!open) },
      },
        label,
        h(IconChevronDownOutline14, {className: chevronClassName}),
      )
    ),
  })
}
