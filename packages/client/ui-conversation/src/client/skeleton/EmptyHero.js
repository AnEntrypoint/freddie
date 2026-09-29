import { createElement as h } from '@freddie/webjsx'
import {
  IconChevronDownOutline14, IconFolderClose16, IconFolderOpen16,
} from '@freddie/freddie-client-ui-primitives'
import { workspaceTitleOf } from '@freddie/freddie-client-runtime/client'
import css from './HeroShell.css.js'

export function workspaceLabel(cwd) {
  const base = workspaceTitleOf(cwd)
  return base !== '' ? base : cwd
}

export function WorkspaceChip({ buttonRef, label, menuOpen = false, onClick, t }) {
  return (
    h('button',
      {
        ref: buttonRef,
        type: 'button',
        class: css.workspace ?? '',
        'aria-label': t('hero.chooseWorkspace'),
        'aria-haspopup': 'menu',
        'aria-expanded': menuOpen,
        onclick: onClick ?? null,
      },
      label === undefined
        ? h(IconFolderClose16, { className: css.folder, size: 16 })
        : h(IconFolderOpen16, { className: css.folder, size: 16 }),
      h('span', { class: css.workspaceLabel ?? '' }, label ?? t('hero.chooseWorkspace')),
      h(IconChevronDownOutline14, { className: css.chevron, size: 12 }),
    )
  )
}


export function HeroShell({ children }) {
  return (
    h('div', { class: css.root ?? '' },
      h('div', { class: css.stack ?? '' },
        h('div', { class: css.body ?? '' },
        ),
      ),
      children,
    )
  )
}
