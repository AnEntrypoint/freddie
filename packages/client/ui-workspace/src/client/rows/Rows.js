/**
 * Workspace browser tree row components (figma Cell set 14:3080): pure presentational —
 * all data and callbacks arrive via props. Hover swaps (folder->chevron,
 * time->ellipsis, action buttons) are CSS-only. Row ... menus are visual-only
 * except workspace Rename/Delete and session Rename/Fork/Archive; the session
 * and workspace hover cards are suppressed while a menu is open.
 */
import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import {
  IconArchiveOutline20, IconBranchOutline16, IconEditOutline16,
  IconEllipsisOutline16, IconFolderClose16, IconFolderOpen16, IconPlusOutline16,
  IconTrashOutline16, IconTriangleRightFill14, StateDot, renderHoverCard, renderMenu,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import { abbreviateHomePath } from '@freddie/freddie-client-runtime/client'
import { relativeTime } from '../tree.js'
import css from './Rows.css.js'

/** Row display title: blank rows show the localized New Session label. */
function displayTitle(node, t) {
  if (node.blank) return t('session.new')
  return node.readOnly === true ? `${node.title} · ${t('session.readOnly')}` : node.title
}

/** Localized compact relative time ("now"/"5min"). */
function timeLabel(updatedAt, now, t) {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n })
}

/** Hover-card variant: distances wrap in the ago template; the now bucket stays bare (no "now ago"). */
function hoverTimeLabel(updatedAt, now, t) {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t('time.ago', { t: t(`time.${unit}`, { n }) })
}

/**
 * Absolute creation time through the dictionary's date template (the message
 * clock pattern): `toLocaleString` would follow the browser language, not the
 * app locale, and produce mixed-language text after a switch.
 */
function createdLabel(createdAt, t) {
  const d = new Date(createdAt)
  const pad2 = (v) => String(v).padStart(2, '0')
  const date = t('date.ymd', { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() })
  return t('hover.created', { time: `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` })
}

/** Hover-card body: workspace title, display directory path, absolute creation time. */
function WorkspaceHoverContent({ label, cwd, createdAt, t }) {
  return (
    h('div', {class: css.hoverContent ?? ''},
      h('div', {class: css.hoverTitle ?? ''}, label),
      h('div', {class: css.hoverPath ?? ''}, cwd),
      h('div', {class: css.hoverTime ?? ''}, createdLabel(createdAt, t)),
    )
  )
}

/** Pointer-position half of a row (insert line above or below). */
function rowHalf(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

/**
 * Project (workspace) header row custom element: folder + title;
 * hover reveals the chevron and create button, and dwelling on a real
 * Workspace shows its hover card (the ungrouped bucket has none).
 * `containsCurrent` arrives on the node (derivation fact, no renderer scan).
 * Converted from a React function component (useState menuOpen) to a webjsx
 * custom element: menuOpen becomes an instance field, re-render is explicit.
 */
export class FreddieProjectRowItem extends HTMLElement {
  #props = null
  #menuOpen = false
  #hoverCard = null
  #menu = null

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { group, onToggle, onCreate, actions, drag, home, t } = props
    const row = group
    const label = row.workspaceId === undefined ? t('group.ungrouped') : row.label
    const active = group.expanded && group.containsCurrent
    const menuOpen = this.#menuOpen
    const workspaceMenuItems = [
      { id: 'rename', label: t('rename'), icon: h(IconEditOutline16) },
      { id: 'delete', label: t('delete.workspace'), icon: h(IconTrashOutline16), danger: true },
    ]
    const ownRow = (
      h('div', {
        class: clsx(css.projectRow, menuOpen && css.menuOpen),
        role: 'treeitem',
        tabIndex: '0',
        'aria-expanded': String(row.expanded),
        onclick: onToggle,
        onkeydown: (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          onToggle()
        },
        draggable: drag !== undefined,
        ondragstart: drag === undefined
          ? null
          : (e) => {
            if (e.dataTransfer === null) return
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', row.key)
            drag.start()
          },
        ondragend: drag?.end ?? null,
      },
        h('span', {class: clsx(css.slot, css.folder, active && css.folderActive)},
          row.expanded ? h(IconFolderOpen16) : h(IconFolderClose16),
        ),
        h('span', {class: clsx(css.slot, css.chevron)},
          h(IconTriangleRightFill14, {className: clsx(css.arrow, row.expanded && css.arrowOpen)}),
        ),
        h('span', {class: css.projectText ?? ''},
          h('span', {class: css.title ?? ''}, label),
        ),
        h('span', {class: css.rowActions ?? ''},
          actions !== undefined && (
            this.#menu = renderMenu(this.#menu, {
              open: menuOpen,
              onClose: () => { this.#menuOpen = false; this.#render() },
              items: workspaceMenuItems,
              onSelect: (id) => {
                this.#menuOpen = false
                /* v8 ignore next -- workspaceMenuItems carries exactly these two rows today. */
                if (id !== 'rename' && id !== 'delete') { this.#render(); return }
                if (id === 'rename') actions.rename()
                else actions.delete()
                this.#render()
              },
              portal: true,
              closeOnPointerLeave: true,
              anchor: (
                h('button', {
                  type: 'button',
                  class: css.iconButton ?? '',
                  'aria-label': t('actions.workspace.aria', { name: label }),
                  onclick: (e) => { e.stopPropagation(); this.#menuOpen = !this.#menuOpen; this.#render() },
                },
                  h(IconEllipsisOutline16),
                )
              ),
            })
          ),
          h('button', {
            type: 'button',
            class: css.iconButton ?? '',
            'aria-label': t('actions.newSession.aria', { name: label }),
            onclick: (e) => { e.stopPropagation(); onCreate() },
          },
            h(IconPlusOutline16),
          ),
        ),
      )
    )
    if (row.createdAt === undefined) {
      this.#hoverCard?.remove()
      this.#hoverCard = null
      applyDiff(this, ownRow)
      return
    }
    this.#hoverCard = renderHoverCard(this.#hoverCard, {
      anchor: ownRow,
      content: h(WorkspaceHoverContent, {
        label: row.label,
        cwd: row.cwd === undefined ? undefined : abbreviateHomePath(row.cwd, home),
        createdAt: row.createdAt,
        t,
      }),
      disabled: menuOpen,
      copyText: row.cwd,
      copyLabel: t('copy'),
      copiedLabel: t('hover.copied'),
    })
    applyDiff(this, this.#hoverCard)
  }
}

defineElement('freddie-project-row-item', FreddieProjectRowItem)

/* v8 ignore next 3 -- closed-union backstop; only reached if the status is forged */
function assertNever(value) {
  throw new Error(`unknown pending interaction: ${String(value)}`)
}

/**
 * Session status presentation; pending interaction is primary and live activity
 * outranks completion reminders.
 */
function sessionStatuses(node, t) {
  const subagents = node.runningSubagentCount === 0
    ? undefined
    : {
      state: 'ongoing',
      label: t(
        node.runningSubagentCount === 1
          ? 'status.subagentsRunning.one'
          : 'status.subagentsRunning.other',
        { n: node.runningSubagentCount },
      ),
    }
  let pending
  switch (node.pendingInteraction) {
    case 'approval':
      pending = { state: 'warning', label: t('status.waitingApproval') }
      break
    case 'plan-review':
      pending = { state: 'warning', label: t('status.planReview') }
      break
    case 'question':
      pending = { state: 'warning', label: t('status.waitingAnswer') }
      break
    case undefined: break
    /* v8 ignore next -- closed PendingInteractionStatus union */
    default: return assertNever(node.pendingInteraction)
  }
  if (pending !== undefined) return subagents === undefined ? [pending] : [pending, subagents]
  if (node.running) {
    const primary = { state: 'ongoing', label: t('status.running') }
    return subagents === undefined ? [primary] : [primary, subagents]
  }
  if (subagents !== undefined) return [subagents]
  if (node.errored) return [{ state: 'error', label: t('status.errored') }]
  if (node.completed) return [{ state: 'done', label: t('status.completed') }]
  return [{ state: 'done', label: t('status.idle') }]
}

/** Primary status dot plus every status's screen-reader label, shared by the search and session rows. */
function SessionStatusDots({ statuses }) {
  return [
    h(StateDot, {state: statuses[0].state}),
    ...statuses.map(status => (
      h('span', {class: css.visuallyHidden ?? '', key: status.label}, status.label)
    )),
  ]
}

/** Hover-card body: full title, relative time, and every relevant live status. */
function SessionHoverContent({ node, now, t }) {
  const statuses = sessionStatuses(node, t)
  return (
    h('div', {class: css.hoverContent ?? ''},
      h('div', {class: css.hoverTitle ?? ''}, displayTitle(node, t)),
      !node.blank && h('div', {class: css.hoverTime ?? ''}, hoverTimeLabel(node.updatedAt, now, t)),
      statuses.map(status => (
        h('div', {class: css.hoverStatus ?? '', key: status.label},
          h(StateDot, {state: status.state}),
          h('span', null, status.label),
        )
      )),
    )
  )
}

/**
 * One flat search result: title, Workspace context, and optional content
 * excerpt. Search navigation opens the session only; it does not address an
 * event inside the conversation.
 * @param props.result - merged local/content search row.
 * @param props.currentId - selected session id.
 * @param props.active - keyboard-selected result id.
 * @param props.onOpen - open the selected session.
 * @param props.t - Workspace-browser translation seat.
 * @returns the result button.
 */
export function SearchResultItem({ result, currentId, active, onOpen, t }) {
  const selected = result.id === currentId || active
  const statuses = sessionStatuses(result, t)
  const primaryStatus = statuses[0]
  return (
    h('button', {
      type: 'button',
      class: clsx(css.searchResultRow, selected && css.selected),
      role: 'treeitem',
      'aria-selected': String(selected),
      onclick: () => { onOpen(result.id) },
    },
      h('span', {class: css.searchResultHeading ?? ''},
        h('span', {class: css.slot ?? ''},
          (primaryStatus.state !== 'done' || result.completed) && (
            SessionStatusDots({ statuses })
          ),
        ),
        h('span', {class: css.searchResultTitle ?? ''}, result.title),
      ),
      h('span', {class: css.searchResultMeta ?? ''},
        h('span', {class: css.searchResultWorkspace ?? ''}, result.workspace),
        result.snippet !== undefined && (
          h('span', {class: css.searchResultSnippet ?? ''}, result.snippet)
        ),
      ),
    )
  )
}

/**
 * Session row custom element. Converted from a React function component
 * (useState menuOpen) to a webjsx custom element: menuOpen becomes an
 * instance field, re-render is explicit.
 */
export class FreddieSessionNodeItem extends HTMLElement {
  #props = null
  #menuOpen = false
  #hoverCard = null
  #menu = null

  /**
   * One top-level 34px session row: status dot (pending user interaction
   * outranks own or descendant activity), title, relative time, and the row
   * actions menu.
   * @param props.node - derived session node.
   * @param props.currentId - selected session id (row highlight).
   * @param props.now - epoch ms for relative-time formatting.
   * @param props.onOpen - open a session by id.
   * @param props.onRename - open the session rename dialog (id + current title).
   * @param props.onFork - fork a session at its last completed turn.
   * @param props.onArchive - archive a session by id.
   * @param props.drag - optional draggable-row wiring.
   * @param props.flat - omit the empty status slot in the hierarchy-free flat list.
   * @param props.t - the browser root's locale seat.
   */
  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const { node, currentId, now, onOpen, onRename, onFork, onArchive, drag, flat = false, t } = props
    const row = node
    const title = displayTitle(node, t)
    const selected = node.id === currentId
    const statuses = sessionStatuses(node, t)
    const primaryStatus = statuses[0]
    const showStatus = primaryStatus.state !== 'done' || row.completed
    const menuOpen = this.#menuOpen
    const sessionMenuItems = node.readOnly === true
      ? []
      : [
        { id: 'rename', label: t('rename'), icon: h(IconEditOutline16) },
        { id: 'fork', label: t('menu.fork'), icon: h(IconBranchOutline16) },
        { id: 'archive', label: t('menu.archiveSession'), icon: h(IconArchiveOutline20, {size: 16}) },
      ]
    const ownRow = (
      h('div', {
        class: clsx(
          css.sessionRow, selected && css.selected, menuOpen && css.menuOpen,
          flat && !showStatus && css.flatSessionRowWithoutStatus,
          drag?.marker === 'before' && css.dropBefore, drag?.marker === 'after' && css.dropAfter,
        ),
        role: 'treeitem',
        tabIndex: '0',
        'aria-selected': String(selected),
        onclick: () => { if (node.readOnly !== true) onOpen(node.id) },
        onkeydown: (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          if (node.readOnly !== true) onOpen(node.id)
        },
        draggable: drag !== undefined && node.readOnly !== true,
        ondragstart: drag === undefined
          ? null
          : (e) => {
            if (e.dataTransfer === null) return
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', node.id)
            drag.start()
          },
        ondragend: drag?.end ?? null,
        ondragover: drag === undefined
          ? null
          : (e) => {
            if (!drag.active) return
            e.preventDefault()
            if (e.dataTransfer !== null) e.dataTransfer.dropEffect = 'move'
            drag.hover(rowHalf(e))
          },
        ondrop: drag === undefined
          ? null
          : (e) => {
            if (!drag.active) return
            e.preventDefault()
            drag.drop(rowHalf(e))
          },
      },
        (!flat || showStatus) && (
          h('span', {class: css.slot ?? ''},
            showStatus && SessionStatusDots({ statuses }),
          )
        ),
        h('span', {class: css.title ?? ''}, title),
        !row.blank && h('span', {class: css.time ?? ''}, timeLabel(row.updatedAt, now, t)),
        !row.blank && node.readOnly !== true && (
          h('span', {class: css.rowActions ?? ''},
            this.#menu = renderMenu(this.#menu, {
              open: menuOpen,
              onClose: () => { this.#menuOpen = false; this.#render() },
              items: sessionMenuItems,
              onSelect: (id) => {
                this.#menuOpen = false
                if (id === 'rename') onRename(node.id, row.title)
                if (id === 'fork') onFork(node.id)
                if (id === 'archive') onArchive(node.id)
                this.#render()
              },
              portal: true,
              closeOnPointerLeave: true,
              anchor: (
                h('button', {
                  type: 'button',
                  class: css.iconButton ?? '',
                  'aria-label': t('actions.session.aria', { name: title }),
                  onclick: (e) => { e.stopPropagation(); this.#menuOpen = !this.#menuOpen; this.#render() },
                },
                  h(IconEllipsisOutline16),
                )
              ),
            }),
          )
        ),
      )
    )
    this.#hoverCard = renderHoverCard(this.#hoverCard, {
      anchor: ownRow,
      content: h(SessionHoverContent, {node, now, t}),
      disabled: menuOpen || drag?.active === true,
      copyText: row.blank ? undefined : row.title,
      copyLabel: t('copy'),
      copiedLabel: t('hover.copied'),
    })
    applyDiff(this, this.#hoverCard)
  }
}

defineElement('freddie-session-node-item', FreddieSessionNodeItem)
