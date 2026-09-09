/** Trajectory toolbar: timeline and ledger fold controls. */

import { createElement as h } from 'webjsx'
import { IconSearchOutline16 } from '@freddie/freddie-client-ui-primitives'
import css from './TrajectoryToolbar.css.js'

/**
 * Render the sticky trajectory toolbar.
 * @param props - rendered counts and whole-list fold state.
 * @returns the toolbar element.
 */
export function TrajectoryToolbar({
  actualDuration,
  onActualDurationChange,
  actualTime,
  onActualTimeChange,
  allTurnsCollapsed,
  onToggleAllTurns,
  allAssistantsCollapsed,
  onToggleAllAssistants,
  searchQuery,
  onSearchQueryChange,
  t,
}) {
  return (
    h('div', {class: css.root ?? '', role: 'toolbar', 'aria-label': t('toolbar.aria')},
      h('div', {class: css.inner ?? ''},
        h('div', {class: css.actions ?? ''},
          h('button', {
            type: 'button',
            class: css.toggle ?? '',
            'aria-label': t('toolbar.useActualDuration'),
            'aria-pressed': actualDuration,
            title: actualDuration ? t('toolbar.useEqualWidth') : t('toolbar.useActualDuration'),
            onclick: () => { onActualDurationChange(!actualDuration) },
          },
            h('svg', {
              class: css.toggleIcon ?? '',
              viewBox: '0 0 16 16',
              fill: 'none',
              'aria-hidden': 'true',
            },
              h('circle', {cx: '8', cy: '8', r: '5.25'}),
              h('path', {d: 'M8 4.75V8l2.25 1.5'}),
            ),
            t('toolbar.duration'),
          ),
          h('button', {
            type: 'button',
            class: css.control ?? '',
            role: 'switch',
            'aria-checked': actualTime,
            hidden: true,
            onclick: () => { onActualTimeChange(!actualTime) },
          },
            h('span', null, t('toolbar.actualTime')),
            h('span', {class: css.controlTrack ?? '', 'data-on': actualTime || undefined, 'aria-hidden': 'true'},
              h('span', {class: css.controlThumb ?? ''}),
            ),
          ),
          h('button', {
            type: 'button',
            class: css.action ?? '',
            'aria-label': allTurnsCollapsed ? t('toolbar.expandTurns') : t('toolbar.collapseTurns'),
            'aria-pressed': allTurnsCollapsed,
            title: allTurnsCollapsed ? t('toolbar.expandTurns') : t('toolbar.collapseTurns'),
            onclick: onToggleAllTurns,
          },
            h('span', {class: css.actionIcon ?? '', 'aria-hidden': 'true'},
              allTurnsCollapsed ? '⊞' : '⊟',
            ),
            t('toolbar.turns'),
          ),
          h('button', {
            type: 'button',
            class: css.action ?? '',
            'aria-label': allAssistantsCollapsed ? t('toolbar.expandCalls') : t('toolbar.collapseCalls'),
            'aria-pressed': allAssistantsCollapsed,
            title: allAssistantsCollapsed ? t('toolbar.expandCalls') : t('toolbar.collapseCalls'),
            onclick: onToggleAllAssistants,
          },
            h('span', {class: css.actionIcon ?? '', 'aria-hidden': 'true'},
              allAssistantsCollapsed ? '⊞' : '⊟',
            ),
            t('toolbar.calls'),
          ),
        ),
        h('div', {class: css.search ?? ''},
          h(IconSearchOutline16, {size: 11, className: css.searchIcon ?? ''}),
          h('input', {
            type: 'search',
            class: css.searchInput ?? '',
            'aria-label': t('toolbar.search'),
            placeholder: t('toolbar.searchPlaceholder'),
            value: searchQuery,
            oninput: (event) => { onSearchQueryChange((event.currentTarget).value) },
          }),
        ),
      ),
    )
  )
}
