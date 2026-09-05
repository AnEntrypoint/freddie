/**
 * The preset picker both surfaces render: a menu of presets over a button
 * naming the current one.
 *
 * The settings row and the composer seat differ in where they sit, what they
 * call the current value, and when they refuse a pick — not in how the picker
 * itself behaves. Trust is the one thing the list always says: a locally
 * authored preset is exactly as privileged as the plugins it names, so the
 * label marks it rather than presenting every preset as shipped and vetted.
 */

import { IconChevronDownOutline14, renderMenu } from '@freddie/freddie-client-ui-primitives'
import { presetDisplayText } from './locales.js'
import { createElement as h, Fragment } from 'webjsx'

/**
 * Build or update the preset picker: a menu of presets over a button naming
 * the current one. Returns a real `freddie-menu` element (self-rendering, see
 * Menu.tsx) — the caller must attach it to the DOM directly (e.g. via
 * `replaceWith`/`appendChild`), never diff it in as a JSX child. Pass the
 * previously returned element back in as `el` to update it in place instead
 * of recreating it (preserves the menu's own internal state).
 * @param el - an existing menu element from a prior call, or null to create one.
 * @param props - the calling surface's copy, styling, and handlers.
 * @returns the menu-with-trigger element.
 */
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
        // All preset surfaces resolve copy the same way; the id is addressing,
        // not a label, except where no display name exists.
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
