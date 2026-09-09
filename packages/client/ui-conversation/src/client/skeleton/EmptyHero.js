// Hero chrome for the blank-draft phase of ConversationRoot: fish headline,
// glow backdrop, and the workspace row. Pure presentation — the resident
// composer is NOT rendered here (it keeps its own stable tree position in
// ConversationRoot so the textarea survives the hero → composer flip); CSS
// positions it over this shell's glow area during the hero phase.

import { createElement as h } from 'webjsx'
import {
  IconChevronDownOutline14, IconFolderClose16, IconFolderOpen16,
} from '@freddie/freddie-client-ui-primitives'
import { workspaceTitleOf } from '@freddie/freddie-client-runtime/client'
import css from './HeroShell.css.js'

/**
 * Basename label for the workspace chip (the shared derivation);
 * separator-only paths echo the raw cwd.
 * @param cwd - workspace directory path (non-empty).
 * @returns chip label.
 */
export function workspaceLabel(cwd) {
  const base = workspaceTitleOf(cwd)
  return base !== '' ? base : cwd
}

/**
 * The workspace chip (folder + label + chevron), always interactive: before
 * the first message the workspace stays switchable — picking another one
 * moves the New Session flow to that workspace's blank session. Without a
 * label the chip renders its placeholder state: closed folder + the
 * "Choose workspace" call to action.
 * @param props.label - chip label (see {@link workspaceLabel}); omitted → placeholder.
 * @param props.menuOpen - menu expansion echo.
 * @param props.onClick - menu toggle.
 * @returns the chip button element.
 */
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


/** Hero chrome props. The workspace row rides the InputBar accessory hole, not here. */

/**
 * Render the hero chrome (no headline/logo/preview badge -- freddie is
 * already named in the sidebar; no glow, no composer, no workspace row —
 * the glow is the owner's {@link HeroGlow}).
 * @param props - see {@link HeroShellProps}.
 * @returns the centered hero element tree.
 */
export function HeroShell({ children }) {
  return (
    h('div', { class: css.root ?? '' },
      h('div', { class: css.stack ?? '' },
        h('div', { class: css.body ?? '' },
          // The resident composer (ConversationRoot's root-owned scrollport;
          // the workspace row rides the stack above the card) is CSS-centered
          // in that scroll body during hero — see
          // ConversationRoot.module.css [data-phase='hero'].
        ),
      ),
      children,
    )
  )
}
