/**
 * Shell chrome content registered into the shell's trigger/header seats: the
 * trigger row icon + label (figma sidebar foot) and the panel title text.
 * The shell renders the surrounding chrome (button, nav heading row) and
 * reads each entry's `label` option for aria text.
 */
import { createElement as h, Fragment } from 'webjsx'
import { IconSettingsOutline14, IconSettingsOutline16 } from '@freddie/freddie-client-ui-primitives'
import css from './chrome.css.js'

/**
 * Render the trigger row content (icon; label only in the wide column).
 * @param props - composed slot props.
 * @returns the trigger content fragment.
 */
export function TriggerContent({ wide, t }) {
  return (
    h('span', {class: css.triggerContent ?? ''},
      wide ? h(IconSettingsOutline16, {size: 16}) : h(IconSettingsOutline14, {size: 18}),
      wide && h('span', {class: css.triggerLabel ?? ''}, t('trigger')),
    )
  )
}

/**
 * Render the panel title text.
 * @param props - composed slot props.
 * @returns the title text node.
 */
export function HeaderContent({ t }) {
  return t('title')
}

/**
 * Render the close button's visually-hidden label text.
 * @param props - composed slot props.
 * @returns the label text node.
 */
export function CloseLabel({ t }) {
  return t('close')
}
