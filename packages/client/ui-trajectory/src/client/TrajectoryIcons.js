import { createElement as h } from '@freddie/webjsx'
import {
  IconSettingsOutline16,
  IconSparkle16,
  IconUserOutline16,
} from '@freddie/freddie-client-ui-primitives'

function ToolWrenchIcon() {
  return (
    h('svg', {
      width: '13',
      height: '13',
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.5',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'data-role-icon': 'wrench',
      'aria-hidden': 'true',
    },
      h('path', {d: 'M14 3.3a3.8 3.8 0 0 1-4.8 4.8l-5.1 5.1a1.6 1.6 0 1 1-2.3-2.3l5.1-5.1A3.8 3.8 0 0 1 11.7 1l-2.3 2.3 2.3 2.3L14 3.3Z'}),
    )
  )
}

function InformationIcon() {
  return (
    h('svg', {
      width: '14',
      height: '14',
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.4',
      'stroke-linecap': 'round',
      'data-role-icon': 'information',
      'aria-hidden': 'true',
    },
      h('circle', {cx: '8', cy: '8', r: '6.7'}),
      h('circle', {cx: '8', cy: '5.5', r: '.85', fill: 'currentColor', stroke: 'none'}),
      h('path', {d: 'M8 7.75v3.4', 'stroke-width': '1.8'}),
    )
  )
}

function CompactedIcon() {
  return (
    h('svg', {
      width: '13',
      height: '13',
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.5',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'data-role-icon': 'compacted',
      'aria-hidden': 'true',
    },
      h('path', {d: 'm2.5 2.5 3.75 3.75M3 6.25h3.25V3'}),
      h('path', {d: 'm13.5 2.5-3.75 3.75M13 6.25H9.75V3'}),
      h('path', {d: 'm2.5 13.5 3.75-3.75M3 9.75h3.25V13'}),
      h('path', {d: 'm13.5 13.5-3.75-3.75M13 9.75H9.75V13'}),
    )
  )
}

export function kindIcon(kind) {
  switch (kind) {
    case 'system': return h(IconSettingsOutline16, {size: 13})
    case 'user': return h(IconUserOutline16, {size: 13})
    case 'context': return h(InformationIcon, null)
    case 'compacted': return h(CompactedIcon, null)
    case 'message': return h(IconSparkle16, {size: 13})
    case 'tool': return h(ToolWrenchIcon, null)
    case 'subtool': return h(ToolWrenchIcon, null)
  }
}
