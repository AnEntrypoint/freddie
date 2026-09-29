import { createElement as h, Fragment } from '@freddie/webjsx'
import { IconSettingsOutline14, IconSettingsOutline16 } from '@freddie/freddie-client-ui-primitives'
import css from './chrome.css.js'

export function TriggerContent({ wide, t }) {
  return (
    h('span', {class: css.triggerContent ?? ''},
      wide ? h(IconSettingsOutline16, {size: 16}) : h(IconSettingsOutline14, {size: 18}),
      wide && h('span', {class: css.triggerLabel ?? ''}, t('trigger')),
    )
  )
}

export function HeaderContent({ t }) {
  return t('title')
}

export function CloseLabel({ t }) {
  return t('close')
}
