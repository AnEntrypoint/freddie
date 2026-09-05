/**
 * The workspace/session browsing region filling the sidebar shell's
 * `sidebar.workspaces` hole: section header (title + view options + add
 * workspace), search, the grouped tree or flat list, and the workspace
 * dialogs. Wide state renders the full browser; rail state renders the two
 * region icons (search / add workspace) as 36px controls on the shell's shared
 * rail entry path, each requesting expansion through the owner share. Adding
 * is the header button's one action, so it raises the directory flow with no
 * menu in between; the flow and its error dialog live in WorkspacePicker
 * (same package — direct composition, no slot between them).
 *
 * Converted from a React hooks component tree to webjsx custom elements:
 * every nested component that held `useState`/`useRef`/`useEffect` identity
 * (ViewOptionsMenu, SessionTree, FlatList, SearchResults, and the top-level
 * WorkspaceBrowser itself) becomes its own `HTMLElement` subclass with
 * private fields replacing hook state, `setProps`/`connectedCallback`/
 * `disconnectedCallback` replacing mount/cleanup effects, and explicit
 * `applyDiff(this, vdom)` replacing implicit re-render. The framework's own
 * selector hooks (`useSessions`, `useWorkspaces`, `useStore`,
 * `useHostDescription`, `useDirectoryFlow`) are still called as plain
 * functions inside `#render()`, exactly as ConversationRoot.tsx (already
 * converted, ui-conversation) does — they are getSnapshot+subscribe sources
 * bound by the framework's render machinery, not React hooks, so no manual
 * subscribe/unsubscribe wiring is needed here.
 */
import { applyDiff, createElement as h } from 'webjsx'
import clsx from 'clsx'
import {
  Button, IconCloseFill14, IconPersonalizationOutline16,
  IconProjectAddOutline16, IconSearchOutline16, renderMenu,
  renderModal, renderTooltip,
} from '@freddie/freddie-client-ui-primitives'
import { deriveFlat, deriveGroups, deriveSearchResults, UNGROUPED_KEY } from './tree.js'
import {
  FreddieProjectRowItem, FreddieSessionNodeItem, SearchResultItem,
} from './rows/Rows.js'

/**
 * Reuse the same row custom element across renders, keyed by row identity, so
 * a row that re-renders every tick (the live relative-time clock) keeps its
 * element instance instead of getting swapped for a fresh one each time --
 * see Rows.js' `#hoverCard`/`#menu` reuse comments for the exact failure mode
 * a fresh element per render causes (a real, open HoverCard swapped out from
 * under the pointer before its own disconnectedCallback cleanup can run,
 * leaking a detached portal card in document.body that nothing ever removes).
 * Reusing the row element here is what makes that per-row reuse effective --
 * without it, Rows.js still creates a fresh `#hoverCard` every render because
 * it never gets an existing instance to reuse.
 * @param cache - Map<rowId, HTMLElement> owned by the calling component,
 *   cleared of stale entries by {@link pruneRowCache} once per render.
 * @param tag - custom element tag name to create when the cache misses.
 * @param rowId - stable identity for the row (workspace/group key, session id).
 * @param props - forwarded verbatim to the element's `setProps`.
 * @returns the cached (or newly created) element, updated in place.
 */
function cachedRowItem(cache, tag, rowId, props) {
  let el = cache.get(rowId)
  if (el === undefined) {
    el = document.createElement(tag)
    cache.set(rowId, el)
  }
  el.setProps(props)
  return el
}

/**
 * Drop cache entries for rows no longer present, so a closed session or
 * removed workspace does not pin its element (and HoverCard portal) forever.
 * @param cache - the row-item cache to prune.
 * @param liveIds - identities present in the current render.
 */
function pruneRowCache(cache, liveIds) {
  if (cache.size === liveIds.size) return
  const live = liveIds instanceof Set ? liveIds : new Set(liveIds)
  for (const id of cache.keys()) {
    if (!live.has(id)) cache.delete(id)
  }
}

/** `freddie-project-row-item` (Rows.js exports only the class), reused per group key via `cache`. */
function ProjectRowItem(cache, rowId, props) {
  return cachedRowItem(cache, 'freddie-project-row-item', rowId, props)
}

/** `freddie-session-node-item` (Rows.js exports only the class), reused per session id via `cache`. */
function SessionNodeItem(cache, rowId, props) {
  return cachedRowItem(cache, 'freddie-session-node-item', rowId, props)
}
import { FLAT_SESSION_ORDER_KEY } from './stores.js'
import { renderWorkspacePickFlow } from './WorkspacePicker.js'
import css from './WorkspaceBrowser.css.js'

/**
 * Column slide length (--ds-transition-duration-slow): rail-search focus waits it out —
 * focus() forces a synchronous layout and would jank the slide.
 */
const EXPAND_SLIDE_MS = 300
/** Pause between the latest keystroke and a Host content-search request. */
const SEARCH_DEBOUNCE_MS = 250
/** `session.search` wire bound, measured in JavaScript UTF-16 code units. */
const SEARCH_QUERY_MAX_CODE_UNITS = 500
/** Session rows visible per Workspace before the local overflow control. */
const COLLAPSED_SESSION_LIMIT = 5

/** Keep controlled input and RPC payload inside the session.search wire contract. */
function sanitizeSearchQuery(value) {
  const withoutNul = value.replaceAll('\0', '')
  if (withoutNul.length <= SEARCH_QUERY_MAX_CODE_UNITS) return withoutNul
  let end = SEARCH_QUERY_MAX_CODE_UNITS
  const last = withoutNul.charCodeAt(end - 1)
  const next = withoutNul.charCodeAt(end)
  if (last >= 0xD800 && last <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end--
  return withoutNul.slice(0, end)
}

/** Immutable membership toggle for the local expand-all array. */
function toggled(list, key) {
  return list.includes(key) ? list.filter(k => k !== key) : [...list, key]
}

/**
 * Accept the native drag at document level while a row drag is active: row
 * hover still owns the insertion marker, and releasing outside the list must
 * not be rendered as a rejected drop before dragend commits that last marker.
 * Bind/unbind pair used from `#syncNativeDragAcceptance` (was `useEffect`).
 */
function bindNativeDragAcceptance() {
  const acceptDrag = (event) => {
    event.preventDefault()
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move'
  }
  const acceptDrop = (event) => { event.preventDefault() }
  document.addEventListener('dragover', acceptDrag)
  document.addEventListener('drop', acceptDrop)
  return () => {
    document.removeEventListener('dragover', acceptDrag)
    document.removeEventListener('drop', acceptDrop)
  }
}

/** Owns one drag-source's native-drag-acceptance bind/unbind pair, edge-triggered on the active flag. */
class NativeDragAcceptance {
  #unbind = null
  #active = false

  sync(active) {
    if (active === this.#active) return
    this.#active = active
    this.#unbind?.()
    this.#unbind = active ? bindNativeDragAcceptance() : null
  }

  teardown() {
    this.#unbind?.()
    this.#unbind = null
  }
}

/** Reconcile a stored view order with the Workspace's current session account. */
function reconciledSessionOrder(sessionIds, stored) {
  if (stored === undefined) return [...sessionIds]
  const byId = new Map(sessionIds.map(id => [id, id]))
  const ordered = []
  const included = new Set()
  for (const key of stored) {
    const id = byId.get(key)
    if (id === undefined || included.has(key)) continue
    ordered.push(id)
    included.add(key)
  }
  for (const id of sessionIds) {
    if (included.has(id)) continue
    ordered.push(id)
  }
  return ordered
}

/** Newest update first with stable Session identity as the tie-break. */
function compareSessionRecency(a, b, byId) {
  const aUpdatedAt = byId[a]?.updatedAt ?? Number.NEGATIVE_INFINITY
  const bUpdatedAt = byId[b]?.updatedAt ?? Number.NEGATIVE_INFINITY
  if (aUpdatedAt !== bUpdatedAt) return bUpdatedAt - aUpdatedAt
  return a < b ? -1 : 1
}

/** Reconcile one editable order account and apply its activity-promotion policy. */
function nextSessionOrderAccount({
  sessionIds, previousOrder, previousUpdatedAt, list, orderBy, sortByRecency,
}) {
  let order = reconciledSessionOrder(sessionIds, previousOrder)
  if (sortByRecency) {
    order.sort((a, b) => compareSessionRecency(a, b, list.byId))
  } else if (orderBy === 'updated') {
    const promoted = sessionIds
      .filter((id) => {
        const session = list.byId[id]
        return session !== undefined
          && (previousUpdatedAt[id] === undefined || session.updatedAt > previousUpdatedAt[id])
      })
      .sort((a, b) => compareSessionRecency(a, b, list.byId))
    if (promoted.length > 0) {
      const promotedIds = new Set(promoted)
      order = [...promoted, ...order.filter(id => !promotedIds.has(id))]
    }
  }
  const updatedAt = {}
  for (const id of sessionIds) {
    const session = list.byId[id]
    if (session !== undefined) updatedAt[id] = session.updatedAt
  }
  const orderChanged = previousOrder === undefined
    || order.length !== previousOrder.length
    || order.some((id, index) => id !== previousOrder[index])
  const timestampsChanged = Object.keys(updatedAt).length !== Object.keys(previousUpdatedAt).length
    || Object.entries(updatedAt).some(([id, timestamp]) => previousUpdatedAt[id] !== timestamp)
  return { order, updatedAt, changed: orderChanged || timestampsChanged }
}

/**
 * Grouping and ordering menu custom element; own open state so it resets
 * with the wide chrome. Converted from a React function component
 * (useState open) — open becomes an instance field, re-render is explicit.
 */
export class FreddieViewOptionsMenu extends HTMLElement {
  #props = null
  #open = false
  #menu = null
  #tooltipEl = null

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
    const { groupBy, orderBy, onGroupPick, onOrderPick, t } = props
    const open = this.#open
    this.#menu = renderMenu(this.#menu, {
      open,
      onClose: () => { this.#open = false; this.#render() },
      items: [
        { type: 'label', id: 'group-by', text: t('groupBy.label') },
        { id: 'workspace', label: t('groupBy.workspace') },
        { id: 'flat', label: t('groupBy.flat') },
        { type: 'separator', id: 'order-by-separator' },
        { type: 'label', id: 'order-by', text: t('orderBy.label') },
        { id: 'manual', label: t('orderBy.manual') },
        { id: 'updated', label: t('orderBy.updated') },
      ],
      selectedIds: [groupBy, orderBy],
      onSelect: (id) => {
        if (id === 'workspace' || id === 'flat') onGroupPick(id)
        else if (id === 'manual' || id === 'updated') onOrderPick(id)
        this.#open = false
        this.#render()
      },
      align: 'end',
      dense: true,
      // Portal: the section header clips overflow, so an in-place list would
      // be cut off at the header's bounds.
      portal: true,
      anchor: (
        this.#tooltipEl = renderTooltip(this.#tooltipEl, {
          label: t('viewOptions.label'), side: 'bottom', delayMs: 500,
          children: [
            h('button', {
              type: 'button',
              class: clsx(css.iconButton, css.wide),
              'aria-label': t('viewOptions.label'),
              onclick: () => { this.#open = !this.#open; this.#render() },
            },
              h(IconPersonalizationOutline16),
            ),
          ],
        })
      ),
    })
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-view-options-menu') === undefined) {
  customElements.define('freddie-view-options-menu', FreddieViewOptionsMenu)
}

/** One-shot creation/update helper preserving the original function-component call shape. */
function ViewOptionsMenu(props) {
  const el = document.createElement('freddie-view-options-menu')
  el.setProps(props)
  return el
}

/** Resolve an insertion side from the full rendered workspace group. */
function workspaceGroupHalf(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

/**
 * The scrolling session tree custom element; disconnecting drops the native
 * drag-acceptance listeners and expand-all state. Converted from a React
 * function component: every `useState` becomes a private field, the
 * `useNativeDragAcceptance`/current-group/order-reconciliation `useEffect`s
 * become explicit sync steps at the top of `#render()` compared against
 * previous field values, and `useMemo` derivations become plain recomputes
 * (webjsx re-renders explicitly, so there is no per-frame cost concern to
 * offset).
 */
export class FreddieSessionTree extends HTMLElement {
  #props = null
  #expandedSessionGroups = []
  #drag = null
  #sessionDropCommitted = false
  #workspaceDrag = null
  #workspaceDropCommitted = false
  #previousOrderBy = null
  #nativeDrag = new NativeDragAcceptance()
  #promotedCurrentGroup = undefined
  #projectRowCache = new Map()
  #sessionNodeCache = new Map()

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#nativeDrag.teardown()
  }

  /** Mirrors `useNativeDragAcceptance(active)`: bind/unbind on active-flag change. */
  #syncNativeDragAcceptance(active) {
    this.#nativeDrag.sync(active)
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const {
      useSessions, startSession, open, forkSession, workspaces, archivedSessionIds,
      onRenameRequest, onDeleteRequest, onSessionRename, onSessionArchive,
      insertWorkspaceBefore, insertSessionBefore, orderBy,
      groupExpansion, setGroupExpanded,
      sessionOrderByAccount, sessionUpdatedAtByAccount, syncSessionOrderAccount, setSessionOrder, home, t,
    } = props
    const list = useSessions(s => s)
    const current = list.current
    const drag = this.#drag
    const workspaceDrag = this.#workspaceDrag
    const nativeDragActive = drag !== null || workspaceDrag !== null
    this.#syncNativeDragAcceptance(nativeDragActive)

    const currentGroup = current === undefined
      ? undefined
      : (workspaces.find(w => w.sessionIds.includes(current))?.workspaceId)
        ?? UNGROUPED_KEY
    if (current !== undefined && currentGroup !== undefined && !Object.hasOwn(groupExpansion, currentGroup)
      && this.#promotedCurrentGroup !== currentGroup) {
      this.#promotedCurrentGroup = currentGroup
      setGroupExpanded(currentGroup, true)
    }
    if (current === undefined) this.#promotedCurrentGroup = undefined

    const expandedGroups = Object.entries(groupExpansion).filter(([, expanded]) => expanded).map(([key]) => key)
    const accounted = new Set(workspaces.flatMap(workspace => workspace.sessionIds))
    const ungroupedSessionIds = list.ids.filter(id => list.byId[id] !== undefined && !accounted.has(id))

    if (list.phase === 'ready') {
      const switchedToUpdated = this.#previousOrderBy !== null
        && this.#previousOrderBy !== 'updated' && orderBy === 'updated'
      this.#previousOrderBy = orderBy
      const accounts = [
        ...workspaces.map(workspace => ({
          key: workspace.workspaceId,
          sessionIds: workspace.sessionIds.filter((id) => list.byId[id] !== undefined),
        })),
        { key: UNGROUPED_KEY, sessionIds: ungroupedSessionIds },
      ]
      for (const { key, sessionIds } of accounts) {
        const previousOrder = sessionOrderByAccount[key]
        const previousUpdatedAt = sessionUpdatedAtByAccount[key] ?? {}
        const next = nextSessionOrderAccount({
          sessionIds,
          previousOrder,
          previousUpdatedAt,
          list,
          orderBy,
          sortByRecency: orderBy === 'updated' && (previousOrder === undefined || switchedToUpdated),
        })
        if (next.changed) {
          syncSessionOrderAccount(key, next.order.map(id => id), next.updatedAt)
        }
      }
    }

    const orderedWorkspaces = workspaces.map((workspace) => {
      const stored = sessionOrderByAccount[workspace.workspaceId]
      const sessionIds = reconciledSessionOrder(workspace.sessionIds, stored)
      return { ...workspace, sessionIds }
    })
    const orderedUngroupedSessionIds = reconciledSessionOrder(ungroupedSessionIds, sessionOrderByAccount[UNGROUPED_KEY])
    const groups = deriveGroups(list, orderedWorkspaces, archivedSessionIds, {
      expandedGroups,
      ...(sessionOrderByAccount[UNGROUPED_KEY] === undefined
        ? {}
        : { ungroupedOrder: sessionOrderByAccount[UNGROUPED_KEY] }),
    })
    const now = Date.now()

    const commitSessionDrag = (activeDrag, over) => {
      if (this.#sessionDropCommitted) return
      this.#sessionDropCommitted = true
      this.#drag = null
      const group = groups.find(candidate => candidate.key === activeDrag.accountKey)
      if (group === undefined) { this.#render(); return }
      const targetIndex = group.sessions.findIndex(session => session.id === over.id)
      if (targetIndex === -1) { this.#render(); return }
      const anchor = over.half === 'before' ? over.id : group.sessions[targetIndex + 1]?.id
      if (anchor === activeDrag.sessionId) { this.#render(); return }
      const sourceIndex = group.sessions.findIndex(session => session.id === activeDrag.sessionId)
      const anchorIndex = anchor === undefined
        ? group.sessions.length
        : group.sessions.findIndex(session => session.id === anchor)
      if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) { this.#render(); return }
      const accountSessionIds = activeDrag.accountKey === UNGROUPED_KEY
        ? orderedUngroupedSessionIds
        : orderedWorkspaces.find(workspace => workspace.workspaceId === activeDrag.accountKey)?.sessionIds
      if (accountSessionIds === undefined) { this.#render(); return }
      const nextOrder = accountSessionIds.filter((id) => id !== activeDrag.sessionId)
      const insertAt = anchor === undefined ? nextOrder.length : nextOrder.indexOf(anchor)
      nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, activeDrag.sessionId)
      setSessionOrder(activeDrag.accountKey, nextOrder.map((id) => id))
      if (orderBy !== 'updated' && activeDrag.accountKey !== UNGROUPED_KEY) {
        insertSessionBefore(activeDrag.accountKey, activeDrag.sessionId, anchor).catch((reason) => {
          console.warn('session reorder rejected:', reason)
        })
      }
      this.#render()
    }
    const commitWorkspaceDrag = (
      activeDrag,
      over,
    ) => {
      if (this.#workspaceDropCommitted) return
      this.#workspaceDropCommitted = true
      this.#workspaceDrag = null
      const rowIndex = workspaces.findIndex(workspace => workspace.workspaceId === over.id)
      if (rowIndex === -1) { this.#render(); return }
      const anchor = over.half === 'before' ? over.id : workspaces[rowIndex + 1]?.workspaceId
      if (anchor === activeDrag.workspaceId) { this.#render(); return }
      const sourceIndex = workspaces.findIndex(workspace => workspace.workspaceId === activeDrag.workspaceId)
      const anchorIndex = anchor === undefined
        ? workspaces.length
        : workspaces.findIndex(workspace => workspace.workspaceId === anchor)
      if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) { this.#render(); return }
      insertWorkspaceBefore(activeDrag.workspaceId, anchor).catch((reason) => {
        console.warn('workspace reorder rejected:', reason)
      })
      this.#render()
    }
    const workspaceDropAtListStart = groups[0]?.workspaceId !== undefined
      && workspaceDrag?.over?.id === groups[0].workspaceId
      && workspaceDrag?.over?.half === 'before'

    const vdom = (
      h('div', {class: clsx(css.treeBody, css.wide)},
        workspaceDropAtListStart && h('span', {class: css.listTopDropIndicator ?? '', 'aria-hidden': 'true'}),
        h('div', {
          class: clsx(css.list, workspaceDropAtListStart && css.listTopDropActive),
          role: 'tree',
          'aria-label': t('section.sessions'),
        },
          groups.length === 0 && (
            h('div', {class: css.empty ?? ''}, t('empty.none'))
          ),
          groups.map((group) => {
            const workspaceId = group.workspaceId
            const workspaceMarker = workspaceId !== undefined && workspaceDrag?.over?.id === workspaceId
              ? (workspaceDrag?.over?.half ?? null)
              : null
            const workspaceDragProps = workspaceId === undefined ? undefined : {
              start: () => {
                this.#workspaceDropCommitted = false
                this.#workspaceDrag = { workspaceId, over: null }
                this.#render()
              },
              end: () => {
                const wd = this.#workspaceDrag
                if (wd?.over !== null && wd?.over !== undefined) {
                  commitWorkspaceDrag(wd, wd.over)
                } else {
                  this.#workspaceDrag = null
                  this.#render()
                }
                this.#workspaceDropCommitted = false
              },
            }
            const hoverWorkspace = workspaceId === undefined
              ? undefined
              : (half) => {
                if (this.#workspaceDrag === null) return
                this.#workspaceDrag = { ...this.#workspaceDrag, over: { id: workspaceId, half } }
                this.#render()
              }
            const dropWorkspace = workspaceId === undefined
              ? undefined
              : (half) => {
                if (this.#workspaceDrag === null) return
                commitWorkspaceDrag(this.#workspaceDrag, { id: workspaceId, half })
              }
            return (
            // Group section: header row + expanded top-level session rows. The
            // inter-group breathing room is the section's own margin
            // (WorkspaceBrowser.module.css).
              h('div', {
                key: group.key,
                class: clsx(
                  css.groupSection,
                  workspaceMarker === 'before' && css.workspaceDropBefore,
                  workspaceMarker === 'after' && css.workspaceDropAfter,
                ),
                ondragover: workspaceDrag === null || hoverWorkspace === undefined
                  ? null
                  : (e) => {
                    e.preventDefault()
                    if (e.dataTransfer !== null) e.dataTransfer.dropEffect = 'move'
                    hoverWorkspace(workspaceGroupHalf(e))
                  },
                ondrop: workspaceDrag === null || dropWorkspace === undefined
                  ? null
                  : (e) => {
                    e.preventDefault()
                    dropWorkspace(workspaceGroupHalf(e))
                  },
              },
                ProjectRowItem(this.#projectRowCache, group.key, {
                  group,
                  home,
                  t,
                  onToggle: () => {
                    if (group.expanded) {
                      this.#expandedSessionGroups = this.#expandedSessionGroups.filter(key => key !== group.key)
                    }
                    setGroupExpanded(group.key, !group.expanded)
                    this.#render()
                  },
                  onCreate: () => {
                    if (group.workspaceId !== undefined) {
                      setGroupExpanded(group.key, true)
                      startSession(group.workspaceId)
                      this.#render()
                    }
                  },
                  drag: workspaceDragProps,
                  actions: group.workspaceId === undefined
                    ? undefined
                    : {
                      rename: () => {
                        /* v8 ignore next -- narrowing guard: the actions object exists only for real-workspace groups. */
                        if (group.workspaceId !== undefined) onRenameRequest(group.workspaceId, group.label)
                      },
                      delete: () => {
                        /* v8 ignore next -- narrowing guard: the actions object exists only for real-workspace groups. */
                        if (group.workspaceId !== undefined) onDeleteRequest(group.workspaceId, group.label)
                      },
                    },
                }),
                (this.#expandedSessionGroups.includes(group.key)
                  ? group.sessions
                  : group.sessions.slice(0, COLLAPSED_SESSION_LIMIT)
                ).map((node) => {
                // Session drag never leaves its group. Ungrouped writes only the
                // browser-local account; real Workspaces may also write Host order.
                  const sameGroupDrag = drag !== null && drag.accountKey === group.key
                  const dragProps = {
                    start: () => {
                      this.#sessionDropCommitted = false
                      this.#drag = { accountKey: group.key, sessionId: node.id, over: null }
                      this.#render()
                    },
                    active: sameGroupDrag,
                    marker: sameGroupDrag && drag.over?.id === node.id ? drag.over.half : null,
                    hover: (half) => {
                    /* v8 ignore next -- narrowing guard: Rows gates hover on `active`, which is false while the drag state is null. */
                      if (this.#drag === null) return
                      this.#drag = { ...this.#drag, over: { id: node.id, half } }
                      this.#render()
                    },
                    drop: (half) => {
                    /* v8 ignore next -- narrowing guard: Rows gates drop on `active`, which is false while the drag state is null. */
                      if (this.#drag === null) return
                      commitSessionDrag(this.#drag, { id: node.id, half })
                    },
                    end: () => {
                      const d = this.#drag
                      if (d?.over !== null && d?.over !== undefined) commitSessionDrag(d, d.over)
                      else { this.#drag = null; this.#render() }
                      this.#sessionDropCommitted = false
                    },
                  }
                  return h('div', { key: node.id, style: 'display:contents' },
                    SessionNodeItem(this.#sessionNodeCache, node.id, {
                      node,
                      currentId: current,
                      now,
                      onOpen: open,
                      onRename: onSessionRename,
                      onFork: forkSession,
                      onArchive: onSessionArchive,
                      drag: dragProps,
                      t,
                    }),
                  )
                }),
                group.sessions.length > COLLAPSED_SESSION_LIMIT && (
                  h('button', {
                    type: 'button',
                    class: css.sessionOverflowButton ?? '',
                    'aria-expanded': String(this.#expandedSessionGroups.includes(group.key)),
                    onclick: () => { this.#expandedSessionGroups = toggled(this.#expandedSessionGroups, group.key); this.#render() },
                  },
                    this.#expandedSessionGroups.includes(group.key)
                      ? t('sessions.collapse')
                      : t('sessions.expand', { n: group.sessions.length - COLLAPSED_SESSION_LIMIT }),
                  )
                ),
              )
            )
          }),
        ),
        h('span', {class: css.fade ?? ''}),
      )
    )
    pruneRowCache(this.#projectRowCache, groups.map(group => group.key))
    pruneRowCache(this.#sessionNodeCache, groups.flatMap(group => group.sessions.map(node => node.id)))
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-session-tree') === undefined) {
  customElements.define('freddie-session-tree', FreddieSessionTree)
}

/**
 * Create (if needed) or update a `freddie-session-tree` element in place --
 * pass back the previous return value as `el` so the tree's own row-item
 * caches (see its `#projectRowCache`/`#sessionNodeCache`) survive across the
 * owning WorkspaceBrowser's re-renders.
 */
function SessionTree(el, props) {
  const target = el ?? document.createElement('freddie-session-tree')
  target.setProps(props)
  return target
}

/**
 * The flat "In one list" body custom element: every session is one
 * draggable top-level row. Converted from a React function component —
 * `useState`/`useRef` become private fields, the order-reconciliation
 * `useEffect` becomes an explicit sync step in `#render()`.
 */
export class FreddieFlatList extends HTMLElement {
  #props = null
  #drag = null
  #dropCommitted = false
  #previousOrderBy = null
  #nativeDrag = new NativeDragAcceptance()
  #sessionNodeCache = new Map()

  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#nativeDrag.teardown()
  }

  #syncNativeDragAcceptance(active) {
    this.#nativeDrag.sync(active)
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const {
      useSessions, open, forkSession, onSessionRename, onSessionArchive, archivedSessionIds,
      orderBy, sessionOrderByAccount, sessionUpdatedAtByAccount, syncSessionOrderAccount, setSessionOrder, t,
    } = props
    const list = useSessions(s => s)
    const baseRows = deriveFlat(list, archivedSessionIds)
    const sessionIds = baseRows.map(row => row.id)

    if (list.phase === 'ready') {
      const previousOrder = sessionOrderByAccount[FLAT_SESSION_ORDER_KEY]
      const previousUpdatedAt = sessionUpdatedAtByAccount[FLAT_SESSION_ORDER_KEY] ?? {}
      const switchedToUpdated = this.#previousOrderBy !== null
        && this.#previousOrderBy !== 'updated' && orderBy === 'updated'
      this.#previousOrderBy = orderBy
      const next = nextSessionOrderAccount({
        sessionIds,
        previousOrder,
        previousUpdatedAt,
        list,
        orderBy,
        sortByRecency: orderBy === 'updated' && (previousOrder === undefined || switchedToUpdated),
      })
      if (next.changed) {
        syncSessionOrderAccount(FLAT_SESSION_ORDER_KEY, next.order.map(id => id), next.updatedAt)
      }
    }

    const byId = new Map(baseRows.map(row => [row.id, row]))
    const rows = reconciledSessionOrder(sessionIds, sessionOrderByAccount[FLAT_SESSION_ORDER_KEY])
      .flatMap((id) => {
        const row = byId.get(id)
        return row === undefined ? [] : [row]
      })

    const drag = this.#drag
    this.#syncNativeDragAcceptance(drag !== null)

    const commitDrag = (activeDrag, over) => {
      if (this.#dropCommitted) return
      this.#dropCommitted = true
      this.#drag = null
      const targetIndex = rows.findIndex(row => row.id === over.id)
      if (targetIndex === -1) { this.#render(); return }
      const anchor = over.half === 'before' ? over.id : rows[targetIndex + 1]?.id
      if (anchor === activeDrag.sessionId) { this.#render(); return }
      const sourceIndex = rows.findIndex(row => row.id === activeDrag.sessionId)
      const anchorIndex = anchor === undefined ? rows.length : rows.findIndex(row => row.id === anchor)
      if (sourceIndex !== -1 && (anchorIndex === sourceIndex || anchorIndex === sourceIndex + 1)) { this.#render(); return }
      const nextOrder = rows.map(row => row.id).filter(id => id !== activeDrag.sessionId)
      const insertAt = anchor === undefined ? nextOrder.length : nextOrder.indexOf(anchor)
      nextOrder.splice(insertAt === -1 ? nextOrder.length : insertAt, 0, activeDrag.sessionId)
      setSessionOrder(FLAT_SESSION_ORDER_KEY, nextOrder.map(id => id))
      this.#render()
    }
    const now = Date.now()

    const vdom = (
      h('div', {class: clsx(css.treeBody, css.wide)},
        h('div', {class: clsx(css.list, css.flatList), role: 'tree', 'aria-label': t('section.sessions')},
          rows.length === 0 && (
            h('div', {class: css.empty ?? ''}, t('empty.none'))
          ),
          rows.map((node) => {
            const active = drag !== null
            return h('div', { key: node.id, style: 'display:contents' },
              SessionNodeItem(this.#sessionNodeCache, node.id, {
                node,
                currentId: list.current,
                now,
                onOpen: open,
                onRename: onSessionRename,
                onFork: forkSession,
                onArchive: onSessionArchive,
                flat: true,
                drag: {
                  start: () => {
                    this.#dropCommitted = false
                    this.#drag = { accountKey: FLAT_SESSION_ORDER_KEY, sessionId: node.id, over: null }
                    this.#render()
                  },
                  active,
                  marker: active && drag.over?.id === node.id ? drag.over.half : null,
                  hover: (half) => {
                    if (this.#drag === null) return
                    this.#drag = { ...this.#drag, over: { id: node.id, half } }
                    this.#render()
                  },
                  drop: (half) => {
                    if (this.#drag !== null) commitDrag(this.#drag, { id: node.id, half })
                  },
                  end: () => {
                    const d = this.#drag
                    if (d?.over !== null && d?.over !== undefined) commitDrag(d, d.over)
                    else { this.#drag = null; this.#render() }
                    this.#dropCommitted = false
                  },
                },
                t,
              }),
            )
          }),
        ),
        h('span', {class: css.fade ?? ''}),
      )
    )
    pruneRowCache(this.#sessionNodeCache, rows.map(node => node.id))
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-flat-list') === undefined) {
  customElements.define('freddie-flat-list', FreddieFlatList)
}

/**
 * Create (if needed) or update a `freddie-flat-list` element in place --
 * pass back the previous return value as `el` so the list's own
 * `#sessionNodeCache` survives across the owning WorkspaceBrowser's
 * re-renders.
 */
function FlatList(el, props) {
  const target = el ?? document.createElement('freddie-flat-list')
  target.setProps(props)
  return target
}

/**
 * Flat search body custom element: local metadata matches plus the current
 * Host result page. No hook holds identity across renders here beyond prop
 * reads and a pure derivation, but it stays a custom element (rather than a
 * stateless function) so its call sites match the sibling tree/list bodies.
 */
export class FreddieSearchResults extends HTMLElement {
  #props = null

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
    const { useSessions, open, workspaces, archivedSessionIds, query, remote, resultLimit, t } = props
    const list = useSessions(s => s)
    const currentRemote = remote.query === query
      ? remote
      : { query, status: 'loading', items: [], hasMore: false }
    const results = deriveSearchResults(list, workspaces, query, archivedSessionIds, currentRemote, resultLimit)
    const pending = currentRemote.status === 'loading'
    const failed = currentRemote.status === 'error'

    const vdom = (
      h('div', {class: clsx(css.treeBody, css.wide)},
        h('div', {class: css.list ?? ''},
          h('div', {class: css.searchTree ?? '', role: 'tree', 'aria-label': t('search.results.aria')},
            results.items.map(result => (
              h(SearchResultItem, {
                key: result.id,
                result,
                currentId: list.current,
                onOpen: open,
                t,
              })
            )),
          ),
          pending && (
            h('div', {class: css.searchStatus ?? '', role: 'status'}, t('search.pending'))
          ),
          failed && (
            h('div', {class: css.searchWarning ?? '', role: 'status'},
              t('search.unavailable'),
            )
          ),
          !pending && results.items.length === 0 && (
            h('div', {class: css.empty ?? ''}, t('search.noMatches'))
          ),
          results.hasMore && (
            h('div', {class: css.searchStatus ?? ''},
              t('search.hasMore', { n: resultLimit }),
            )
          ),
        ),
        h('span', {class: css.fade ?? ''}),
      )
    )
    applyDiff(this, vdom)
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-search-results') === undefined) {
  customElements.define('freddie-search-results', FreddieSearchResults)
}

/** One-shot creation/update helper preserving the original function-component call shape. */
function SearchResults(props) {
  const el = document.createElement('freddie-search-results')
  el.setProps(props)
  return el
}

/**
 * The browsing region custom element (registered `freddie-workspace-browser`).
 * Converted from the top-level `WorkspaceBrowser` React function component:
 * every `useState` becomes a private field, every `useRef` becomes a
 * private field holding the current DOM node (looked up after render where
 * a callback ref was used), and every `useEffect` becomes an explicit sync
 * step compared against previous field values, run at the top of
 * `#render()` or from `setProps`/`connectedCallback`/`disconnectedCallback`
 * as appropriate — mirroring Toast.tsx's/HoverCard.tsx's bind/unbind timer
 * field patterns.
 * @see WorkspaceBrowserProps for the field-by-field docs (unchanged from the React version).
 */
export class FreddieWorkspaceBrowser extends HTMLElement {
  #props = null

  // Blank-session promotion (was a `useRef`).
  #promotedBlank = undefined

  // Account-key retention sync edge-trigger (was a useEffect deps array: [workspacePhase, workspaces]).
  #retainedAccountKeys = null

  // Search (wide-only), was useState/useRef.
  #query = ''
  #searchExpanded = false
  #remoteSearch = { query: '', status: 'idle', items: [], hasMore: false }
  #searchRoot = null
  #searchInput = null

  // Section-header + picker.
  #wsPickerOpen = false
  #wsPlusEl = null
  #composing = false
  #wsPickFlow = null
  #tooltips = new Map()

  // Rail search = expand + land in the search box.
  #searchOnExpand = false
  #expandFocusTimer = null
  #expandFocusArmedFor = null

  // Outside-click dismissal.
  #outsideClickBound = false

  // Reused across renders (see SessionTree/FlatList's own row-item-cache
  // comment): this component re-renders on every store tick, and a fresh
  // document.createElement('freddie-session-tree'/'freddie-flat-list') per
  // render would reset that element's own row-item caches to empty every
  // time, defeating them entirely -- the leak this was chasing showed up as
  // a HoverCard portal surviving pointerleave with no #close() ever logged,
  // because the render that should have received the pointerleave belonged
  // to an already-replaced FreddieSessionTree/FreddieFlatList instance.
  #sessionListEl = null
  #sessionListKind = null
  #onOutsideClick = null

  // Search debounce (AbortController), was useEffect keyed on normalizedQuery.
  #searchQueryInFlight = null
  #searchAbort = null
  #searchDebounceTimer = null

  // Rename dialog (workspace).
  #renameTarget = null
  #renameDraft = ''
  #renaming = false
  #renameError = null

  // Session rename dialog.
  #sessionRenameTarget = null
  #sessionRenameDraft = ''
  #sessionRenaming = false
  #sessionRenameError = null

  // Delete dialog.
  #deleteTarget = null
  #deleting = false

  // Self-mounting portal dialogs held across renders (see Modal.tsx doc).
  #renameModal = null
  #sessionRenameModal = null
  #deleteModal = null
  #deleteCommittedId = null
  #deleteError = null

  // See FreddieConversationRoot's identical guard (ui-conversation package):
  // this element's one-shot creation helper calls setProps() synchronously
  // before insertion into the document; connectedCallback then fires again
  // right after. Rendering unconditionally in both places double-renders
  // the first mount around that detach/attach boundary, which has been
  // observed to desync webjsx's per-element diff cache from the live DOM.
  #renderedOnce = false

  setProps(props) {
    this.#props = props
    this.#render()
    this.#renderedOnce = true
  }

  connectedCallback() {
    if (this.#renderedOnce) this.#render()
    this.addEventListener('keydown', this.#onTreeKeyDown)
  }

  disconnectedCallback() {
    this.removeEventListener('keydown', this.#onTreeKeyDown)
    this.#unbindOutsideClick()
    if (this.#expandFocusTimer !== null) { window.clearTimeout(this.#expandFocusTimer); this.#expandFocusTimer = null }
    if (this.#searchDebounceTimer !== null) { window.clearTimeout(this.#searchDebounceTimer); this.#searchDebounceTimer = null }
    this.#searchAbort?.abort()
    this.#searchAbort = null
  }

  // WAI-ARIA tree pattern: ArrowDown/ArrowUp move focus among treeitems
  // (wrapping at the ends), matching role="tree"'s implied keyboard contract
  // -- same fix class as Menu.js. Queries the live DOM rather than tracking a
  // parallel focus-index field, since it must work uniformly across this
  // component's 3 render paths (grouped tree, flat list, search results),
  // each producing role="treeitem" buttons with a different DOM shape.
  #onTreeKeyDown = (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    if (!(event.target instanceof Element) || event.target.getAttribute('role') !== 'treeitem') return
    event.preventDefault()
    const items = [...this.querySelectorAll('[role="treeitem"]:not(:disabled)')]
    if (items.length === 0) return
    const current = items.indexOf(event.target)
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const next = current === -1
      ? (delta > 0 ? 0 : items.length - 1)
      : (current + delta + items.length) % items.length
    items[next].focus()
  }

  #unbindOutsideClick() {
    if (this.#onOutsideClick !== null) {
      document.removeEventListener('click', this.#onOutsideClick)
      this.#onOutsideClick = null
    }
    this.#outsideClickBound = false
  }

  /** Rail search = expand + land in the search box (was a useEffect keyed on [wide, searchOnExpand]). */
  #syncExpandFocus(wide) {
    const armed = wide && this.#searchOnExpand
    const wasArmed = this.#expandFocusArmedFor !== null
      && this.#expandFocusArmedFor.wide && this.#expandFocusArmedFor.searchOnExpand
    if (armed === wasArmed) return
    this.#expandFocusArmedFor = { wide, searchOnExpand: this.#searchOnExpand }
    if (this.#expandFocusTimer !== null) { window.clearTimeout(this.#expandFocusTimer); this.#expandFocusTimer = null }
    if (armed) {
      this.#expandFocusTimer = window.setTimeout(() => {
        this.#searchInput?.focus({ preventScroll: true })
        this.#searchOnExpand = false
        this.#expandFocusTimer = null
        this.#render()
      }, EXPAND_SLIDE_MS)
    }
  }

  /** Focus the search input once expanded (non-rail path), mirrors the second focus effect. */
  #syncSearchExpandedFocus(wide, searchExpanded) {
    if (!wide || !searchExpanded || this.#searchOnExpand) return
    this.#searchInput?.focus({ preventScroll: true })
  }

  /**
   * Outside-click dismissal stays off while the rail gesture is in flight
   * (searchOnExpand): the rail click flips the shell wide and mounts this
   * listener during its own dispatch, then keeps bubbling to document with
   * the now-unmounted rail button as its target — outside searchRoot, so the
   * listener would dismiss the search that click just opened.
   */
  #syncOutsideClick(wide, searchExpanded, normalizedQuery) {
    const shouldBind = wide && searchExpanded && !this.#searchOnExpand
    if (!shouldBind) { this.#unbindOutsideClick(); return }
    if (this.#outsideClickBound) return
    this.#unbindOutsideClick()
    const onClick = (event) => {
      if (!(event.target instanceof Node) || this.#searchRoot?.contains(event.target) === true) return
      this.#searchInput?.blur()
      const currentQuery = sanitizeSearchQuery(this.#query).trim()
      if (currentQuery !== '') return
      this.#searchExpanded = false
      this.#render()
    }
    this.#onOutsideClick = onClick
    this.#outsideClickBound = true
    document.addEventListener('click', onClick)
    void normalizedQuery
  }

  /** Search debounce/AbortController, was a useEffect keyed on normalizedQuery. */
  #syncSearchRequest(normalizedQuery, searchSessions) {
    if (this.#searchQueryInFlight === normalizedQuery) return
    this.#searchQueryInFlight = normalizedQuery
    if (this.#searchDebounceTimer !== null) { window.clearTimeout(this.#searchDebounceTimer); this.#searchDebounceTimer = null }
    this.#searchAbort?.abort()
    this.#searchAbort = null
    if (normalizedQuery === '') {
      this.#remoteSearch = { query: '', status: 'idle', items: [], hasMore: false }
      return
    }
    this.#remoteSearch = { query: normalizedQuery, status: 'loading', items: [], hasMore: false }
    const controller = new AbortController()
    this.#searchAbort = controller
    this.#searchDebounceTimer = window.setTimeout(() => {
      this.#searchDebounceTimer = null
      const props = this.#props
      if (props === null) return
      searchSessions(normalizedQuery, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        this.#remoteSearch = {
          query: normalizedQuery,
          status: 'ready',
          items: result.items,
          hasMore: result.hasMore,
        }
        this.#render()
      }).catch(() => {
        if (controller.signal.aborted) return
        this.#remoteSearch = { query: normalizedQuery, status: 'error', items: [], hasMore: false }
        this.#render()
      })
    }, SEARCH_DEBOUNCE_MS)
  }

  #onSessionRename = (sessionId, currentTitle) => {
    this.#sessionRenameTarget = { sessionId, currentTitle }
    this.#sessionRenameDraft = currentTitle
    this.#sessionRenameError = null
    this.#render()
  }

  #onSessionArchive = (sessionId) => {
    const props = this.#props
    if (props === null) return
    props.archiveSession(sessionId).catch((reason) => {
      console.warn('session archive rejected:', reason)
    })
  }

  #closeRename() {
    if (this.#renaming) return
    this.#renameTarget = null
    this.#renameError = null
    this.#render()
  }

  #confirmRename() {
    const props = this.#props
    const renameTarget = this.#renameTarget
    if (props === null || renameTarget === null) return
    const renameTrimmed = this.#renameDraft.trim()
    const workspaces = props.useWorkspaces(state => state.items)
    const renameDuplicate = renameTrimmed !== '' && renameTrimmed !== renameTarget.currentTitle
      && workspaces.some(w => w.title === renameTrimmed)
    const renameBlocked = this.#renaming || renameTrimmed === ''
      || renameTrimmed === renameTarget.currentTitle || renameDuplicate
    if (renameBlocked) return
    this.#renaming = true
    this.#renameError = null
    this.#render()
    props.renameWorkspace(renameTarget.workspaceId, renameTrimmed).then(() => {
      this.#renaming = false
      this.#renameTarget = null
      this.#render()
    }).catch((reason) => {
      this.#renaming = false
      this.#renameError = reason instanceof Error ? reason.message : String(reason)
      this.#render()
    })
  }

  #closeSessionRename() {
    if (this.#sessionRenaming) return
    this.#sessionRenameTarget = null
    this.#sessionRenameError = null
    this.#render()
  }

  #confirmSessionRename() {
    const props = this.#props
    const sessionRenameTarget = this.#sessionRenameTarget
    if (props === null || sessionRenameTarget === null) return
    const sessionRenameTrimmed = this.#sessionRenameDraft.trim()
    const sessionRenameBlocked = this.#sessionRenaming || sessionRenameTrimmed === ''
    if (sessionRenameBlocked) return
    this.#sessionRenaming = true
    this.#sessionRenameError = null
    this.#render()
    props.renameSession(sessionRenameTarget.sessionId, sessionRenameTrimmed).then(() => {
      this.#sessionRenaming = false
      this.#sessionRenameTarget = null
      this.#render()
    }).catch((reason) => {
      this.#sessionRenaming = false
      this.#sessionRenameError = reason instanceof Error ? reason.message : String(reason)
      this.#render()
    })
  }

  #closeDelete() {
    if (this.#deleting) return
    this.#deleteTarget = null
    this.#deleteError = null
    this.#render()
  }

  #confirmDelete() {
    const props = this.#props
    const deleteTarget = this.#deleteTarget
    /* v8 ignore next -- the Modal is absent without a target and its button is disabled while deleting. */
    if (props === null || this.#deleting || deleteTarget === null) return
    this.#deleting = true
    this.#deleteCommittedId = null
    this.#deleteError = null
    this.#render()
    props.deleteWorkspace(deleteTarget.workspaceId).then(() => {
      // Keep the confirmation pending until this component has rendered the
      // committed list projection without the deleted id. Closing earlier
      // exposes one stale frame to the next Create Workspace gesture.
      this.#deleteCommittedId = deleteTarget.workspaceId
      this.#render()
    }).catch((reason) => {
      this.#deleting = false
      this.#deleteError = reason instanceof Error ? reason.message : String(reason)
      this.#render()
    })
  }

  // h(Tooltip, {...}) calls Tooltip(props) synchronously (webjsx's
  // function-component branch), Tooltip.js's bare one-shot factory --
  // recreating the freddie-tooltip element (dropping its in-flight #showTimer
  // hover-delay) on every #render(). `key` is a stable per-call-site label.
  #tooltip(key, props, ...children) {
    const el = renderTooltip(this.#tooltips.get(key) ?? null, { ...props, children })
    this.#tooltips.set(key, el)
    return el
  }

  /**
   * The grouped-tree or flat-list session body, reusing the same
   * freddie-session-tree/freddie-flat-list element across renders (see
   * SessionTree/FlatList's own doc comments) -- this component re-renders
   * on every store tick, and creating a fresh element each time reset that
   * element's own row-item caches to empty every render, so a HoverCard
   * portal opened mid-hover belonged to an instance already replaced by the
   * time its pointerleave should have closed it (witnessed live: the card
   * survived pointerleave, click-away, and a manually dispatched
   * PointerEvent alike, with #close() never once firing -- the listener was
   * still attached, just on a DOM node no session list component instance
   * owned any more). Switching between flat and grouped view creates a
   * fresh element of the new kind rather than reusing the wrong tag.
   */
  #renderSessionList({
    groupBy, useSessions, open, forkSession, archivedSessionIds, orderBy,
    sessionOrderByAccount, sessionUpdatedAtByAccount, actions, workspaces,
    groupExpansion, startSession, insertWorkspaceBefore, insertSessionBefore, home, t,
  }) {
    if (this.#sessionListKind !== groupBy) {
      this.#sessionListEl = null
      this.#sessionListKind = groupBy
    }
    if (groupBy === 'flat') {
      this.#sessionListEl = FlatList(this.#sessionListEl, {
        useSessions, open, forkSession,
        onSessionRename: this.#onSessionRename, onSessionArchive: this.#onSessionArchive,
        archivedSessionIds,
        orderBy,
        sessionOrderByAccount,
        sessionUpdatedAtByAccount,
        syncSessionOrderAccount: actions.syncSessionOrderAccount,
        setSessionOrder: actions.setSessionOrder,
        t,
      })
      return this.#sessionListEl
    }
    this.#sessionListEl = SessionTree(this.#sessionListEl, {
      useSessions,
      onSessionRename: this.#onSessionRename,
      onSessionArchive: this.#onSessionArchive,
      forkSession,
      workspaces,
      groupExpansion,
      setGroupExpanded: actions.setGroupExpanded,
      sessionOrderByAccount,
      sessionUpdatedAtByAccount,
      syncSessionOrderAccount: actions.syncSessionOrderAccount,
      setSessionOrder: actions.setSessionOrder,
      archivedSessionIds,
      startSession,
      open,
      insertWorkspaceBefore,
      insertSessionBefore,
      orderBy,
      home,
      t,
      onRenameRequest: (workspaceId, currentTitle) => {
        this.#renameTarget = { workspaceId, currentTitle }
        this.#renameDraft = currentTitle
        this.#renameError = null
        this.#render()
      },
      onDeleteRequest: (workspaceId, title) => {
        this.#deleteTarget = { workspaceId, title }
        this.#deleteError = null
        this.#render()
      },
    })
    return this.#sessionListEl
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const {
      wide,
      expandSidebar,
      useSessions,
      useWorkspaces,
      useStore,
      actions,
      startSession,
      open,
      forkSession,
      insertWorkspaceBefore,
      insertSessionBefore,
      createWorkspace,
      searchSessions,
      searchResultLimit,
      useDirectoryFlow,
      useHostDescription,
      renderSlot,
      t,
    } = props

    const home = useHostDescription(description => description?.home)
    const workspaces = useWorkspaces(state => state.items)
    const workspacePhase = useWorkspaces(state => state.phase)
    const archivedSessionIds = useWorkspaces(state => state.archivedSessionIds)
    // Live occupancy of this surface's directory-flow hole (the same source the
    // flow reads): a composition without a picking affordance can add nothing.
    const directoryFlowAvailable = useDirectoryFlow(occupied => occupied)
    const groupBy = useStore(s => s.groupBy)
    const orderBy = useStore(s => s.orderBy)
    const groupExpansion = useStore(s => s.groupExpansion)
    const sessionOrderByAccount = useStore(s => s.sessionOrderByAccount)
    const sessionUpdatedAtByAccount = useStore(s => s.sessionUpdatedAtByAccount)
    const currentBlankSessionId = useSessions((state) => {
      const current = state.current
      return current !== undefined && state.byId[current]?.blank === true ? current : undefined
    })
    const currentBlankAccount = currentBlankSessionId === undefined
      ? undefined
      : (workspaces.find(workspace => workspace.sessionIds.includes(currentBlankSessionId))
        ?.workspaceId) ?? UNGROUPED_KEY

    // Blank-session promotion sync (was a useEffect).
    if (currentBlankSessionId === undefined || currentBlankAccount === undefined) {
      this.#promotedBlank = undefined
    } else if (this.#promotedBlank === undefined
      || this.#promotedBlank.sessionId !== currentBlankSessionId
      || this.#promotedBlank.accountKey !== currentBlankAccount) {
      this.#promotedBlank = { sessionId: currentBlankSessionId, accountKey: currentBlankAccount }
      for (const accountKey of new Set([currentBlankAccount, FLAT_SESSION_ORDER_KEY])) {
        const previous = sessionOrderByAccount[accountKey] ?? []
        actions.setSessionOrder(accountKey, [
          currentBlankSessionId,
          ...previous.filter(id => id !== currentBlankSessionId),
        ])
      }
    }

    // Account-key retention sync (was a useEffect keyed on workspacePhase/workspaces).
    // retainAccountKeys always rebuilds fresh object references (even when
    // nothing is filtered out), so calling it unconditionally every render
    // produced a new store snapshot on every render, which resynchronously
    // re-rendered this subscriber — an infinite loop with no yield point,
    // hanging the tab. Edge-triggered on the actual key set, matching the
    // original effect's dependency array.
    if (workspacePhase === 'ready') {
      const accountKeys = [
        UNGROUPED_KEY,
        FLAT_SESSION_ORDER_KEY,
        ...workspaces.map(workspace => workspace.workspaceId),
      ]
      const accountKeysSignature = accountKeys.join('\0')
      if (this.#retainedAccountKeys !== accountKeysSignature) {
        this.#retainedAccountKeys = accountKeysSignature
        actions.retainAccountKeys(accountKeys)
      }
    }

    const query = this.#query
    const searchExpanded = this.#searchExpanded
    const normalizedQuery = sanitizeSearchQuery(query).trim()
    const remoteSearch = this.#remoteSearch
    const wsPickerOpen = this.#wsPickerOpen

    this.#syncExpandFocus(wide)
    this.#syncSearchExpandedFocus(wide, searchExpanded)
    this.#syncOutsideClick(wide, searchExpanded, normalizedQuery)
    this.#syncSearchRequest(normalizedQuery, searchSessions)

    // Rename dialog derived state.
    const renameTarget = this.#renameTarget
    const renameDraft = this.#renameDraft
    const renaming = this.#renaming
    const renameError = this.#renameError
    const renameTrimmed = renameDraft.trim()
    const renameDuplicate = renameTarget !== null && renameTrimmed !== '' && renameTrimmed !== renameTarget.currentTitle
      && workspaces.some(w => w.title === renameTrimmed)
    const renameBlocked = renaming || renameTrimmed === ''
      || renameTarget === null || renameTrimmed === renameTarget.currentTitle || renameDuplicate

    // Session rename dialog derived state.
    const sessionRenameTarget = this.#sessionRenameTarget
    const sessionRenameDraft = this.#sessionRenameDraft
    const sessionRenaming = this.#sessionRenaming
    const sessionRenameError = this.#sessionRenameError
    const sessionRenameTrimmed = sessionRenameDraft.trim()
    const sessionRenameBlocked = sessionRenaming || sessionRenameTrimmed === '' || sessionRenameTarget === null

    // Delete dialog sync (was a useEffect keyed on [deleteCommittedId, workspaces]).
    const deleteCommittedId = this.#deleteCommittedId
    if (deleteCommittedId !== null && !workspaces.some(workspace => workspace.workspaceId === deleteCommittedId)) {
      this.#deleting = false
      this.#deleteCommittedId = null
      this.#deleteTarget = null
    }
    const deleteTarget = this.#deleteTarget
    const deleting = this.#deleting
    const deleteError = this.#deleteError

    const vdom = (
      h('div', {class: clsx(css.root, !wide && css.rail)},
        h('div', {class: css.sectionHeader ?? ''},
          wide && (
            h('span', {class: clsx(css.sectionLabel, css.wide, searchExpanded && css.sectionLabelHidden)},
              groupBy === 'flat' ? t('section.sessions') : t('section.workspaces'),
            )
          ),
          wide && (
            h('div', {class: clsx(css.searchSlot, searchExpanded && css.searchSlotExpanded)},
              h('div', {
                ref: (el) => { this.#searchRoot = el },
                class: clsx(css.search, searchExpanded && css.searchExpanded),
                onclick: () => {
                  this.#wsPickerOpen = false
                  this.#searchExpanded = true
                  this.#render()
                  this.#searchInput?.focus()
                },
              },
                this.#tooltip('wideSearch', {label: t('search'), side: 'bottom', delayMs: 500, disabled: searchExpanded},
                  h('button', {
                    type: 'button',
                    class: css.searchButton ?? '',
                    'aria-label': t('search.sessions.aria'),
                    'aria-expanded': String(searchExpanded),
                    onclick: () => {
                      this.#wsPickerOpen = false
                      this.#searchExpanded = true
                      this.#render()
                    },
                  },
                    h(IconSearchOutline16, {size: searchExpanded ? 11 : 14}),
                  ),
                ),
                h('input', {
                  ref: (el) => { this.#searchInput = el },
                  class: css.searchInput ?? '',
                  type: 'text',
                  placeholder: t('search.placeholder'),
                  maxLength: String(SEARCH_QUERY_MAX_CODE_UNITS),
                  value: query,
                  tabIndex: String(searchExpanded ? 0 : -1),
                  oninput: (e) => { this.#query = sanitizeSearchQuery((e.target).value); this.#render() },
                  onkeydown: (e) => {
                    if (e.key !== 'Escape') return
                    this.#query = ''
                    this.#searchExpanded = false
                    this.#render()
                  },
                }),
                searchExpanded && (
                  h('button', {
                    type: 'button',
                    class: css.clearButton ?? '',
                    'aria-label': t('search.clear'),
                    onclick: (e) => {
                      e.stopPropagation()
                      this.#query = ''
                      this.#searchExpanded = false
                      this.#render()
                    },
                  },
                    h(IconCloseFill14),
                  )
                ),
              ),
            )
          ),
          h('div', {class: clsx(css.headerActions, wide && searchExpanded && css.headerActionsHidden)},
            wide && ViewOptionsMenu({
              groupBy,
              orderBy,
              onGroupPick: (mode) => { actions.setGroupBy(mode) },
              onOrderPick: (mode) => { actions.setOrderBy(mode) },
              t,
            }),
            /* Adding is the button's one action, so a composition with no
                picking affordance has nothing to offer here: the region hides the
                button rather than leaving a dead one in the header. */
            directoryFlowAvailable && (
              this.#tooltip('workspaceAdd', {label: t('workspace.add'), side: 'bottom', delayMs: 500},
                h('button', {
                  ref: (el) => { this.#wsPlusEl = el },
                  type: 'button',
                  class: css.iconButton ?? '',
                  'aria-label': t('workspace.add'),
                  onclick: () => {
                    this.#wsPickerOpen = !this.#wsPickerOpen
                    this.#render()
                  },
                },
                  h(IconProjectAddOutline16, {size: wide ? 16 : 18}),
                ),
              )
            ),
          ),
          /* Add flow + its error dialog. Cached across renders so the
             auto-open latch on the custom element survives onClose's
             synchronous re-render. */
          (this.#wsPickFlow = renderWorkspacePickFlow(this.#wsPickFlow, {
            t,
            open: wsPickerOpen,
            anchorRef: { current: this.#wsPlusEl },
            useWorkspaces,
            createWorkspace,
            useDirectoryFlow,
            renderDirectoryFlow: owner => renderSlot('sidebar.workspaces.directoryFlow', owner),
            addOnly: true,
            side: 'right',
            onPick: (workspaceId) => {
              this.#wsPickerOpen = false
              this.#render()
              startSession(workspaceId)
            },
            onClose: () => { this.#wsPickerOpen = false; this.#render() },
          })),
        ),

        /* The collapsed rail keeps search as its own 36px control. */
        !wide && h('div', {class: css.search ?? ''},
          this.#tooltip('railSearch', {label: t('search')},
            h('button', {
              type: 'button',
              class: css.searchButton ?? '',
              'aria-label': t('search.sessions.aria'),
              onclick: () => {
                this.#searchExpanded = true
                this.#searchOnExpand = true
                this.#render()
                expandSidebar()
              },
            },
              h(IconSearchOutline16, {size: 18}),
            ),
          ),
        ),

        /* Always-mounted seat keeps the region's flex slot while the list
            itself is wide-only. */
        h('div', {class: css.listArea ?? ''},
          wide && (normalizedQuery !== ''
            ? SearchResults({
              useSessions,
              open,
              workspaces,
              archivedSessionIds,
              query: normalizedQuery,
              remote: remoteSearch,
              resultLimit: searchResultLimit,
              t,
            })
            : this.#renderSessionList({
              groupBy, useSessions, open, forkSession, archivedSessionIds, orderBy,
              sessionOrderByAccount, sessionUpdatedAtByAccount, actions, workspaces,
              groupExpansion, startSession, insertWorkspaceBefore, insertSessionBefore, home, t,
            })),
        ),
      )
    )
    applyDiff(this, vdom)

    this.#renameModal = renderModal(this.#renameModal, {
      open: renameTarget !== null,
      onClose: () => { this.#closeRename() },
      closeLabel: t('close'),
      title: t('rename.workspace.title'),
      footer: [
        h(Button, {variant: 'outline', disabled: renaming, onclick: () => { this.#closeRename() }}, t('cancel')),
        h(Button, {variant: 'primary', disabled: renameBlocked, onclick: () => { this.#confirmRename() }}, t('rename')),
      ],
      children: [
        h('input', {
          class: css.renameInput ?? '',
          value: renameDraft,
          'aria-label': t('field.workspaceName'),
          autofocus: true,
          disabled: renaming,
          onfocus: (e) => { (e.target).select() },
          oninput: (e) => {
            this.#renameDraft = (e.target).value
            this.#renameError = null
            this.#render()
          },
          oncompositionstart: () => { this.#composing = true },
          oncompositionend: () => { this.#composing = false },
          onkeydown: (e) => {
            if (e.key === 'Enter' && !this.#composing) {
              e.preventDefault()
              this.#confirmRename()
            }
          },
        }),
        ...(renameDuplicate
          ? [h('div', {class: css.renameError ?? '', role: 'alert'}, t('conflict.named', { name: renameTrimmed }))]
          : []),
        ...(renameError !== null
          ? [h('div', {class: css.renameError ?? '', role: 'alert'}, renameError)]
          : []),
      ],
    })

    this.#sessionRenameModal = renderModal(this.#sessionRenameModal, {
      open: sessionRenameTarget !== null,
      onClose: () => { this.#closeSessionRename() },
      closeLabel: t('close'),
      title: t('rename.session.title'),
      footer: [
        h(Button, {variant: 'outline', disabled: sessionRenaming, onclick: () => { this.#closeSessionRename() }}, t('cancel')),
        h(Button, {variant: 'primary', disabled: sessionRenameBlocked, onclick: () => { this.#confirmSessionRename() }}, t('rename')),
      ],
      children: [
        h('input', {
          class: css.renameInput ?? '',
          value: sessionRenameDraft,
          'aria-label': t('field.sessionName'),
          autofocus: true,
          disabled: sessionRenaming,
          onfocus: (e) => { (e.target).select() },
          oninput: (e) => {
            this.#sessionRenameDraft = (e.target).value
            this.#sessionRenameError = null
            this.#render()
          },
          oncompositionstart: () => { this.#composing = true },
          oncompositionend: () => { this.#composing = false },
          onkeydown: (e) => {
            if (e.key === 'Enter' && !this.#composing) {
              e.preventDefault()
              this.#confirmSessionRename()
            }
          },
        }),
        ...(sessionRenameError !== null
          ? [h('div', {class: css.renameError ?? '', role: 'alert'}, sessionRenameError)]
          : []),
      ],
    })

    this.#deleteModal = renderModal(this.#deleteModal, {
      open: deleteTarget !== null,
      onClose: () => { this.#closeDelete() },
      closeLabel: t('close'),
      title: t('delete.workspace'),
      ...(deleteTarget === null
        ? {}
        : { description: t('delete.desc', { name: deleteTarget.title }) }),
      footer: [
        h(Button, {variant: 'outline', disabled: deleting, onclick: () => { this.#closeDelete() }}, t('cancel')),
        h(Button, {
          variant: 'outline',
          class: css.deleteAction ?? '',
          disabled: deleting,
          onclick: () => { this.#confirmDelete() },
        },
          t('delete.workspace'),
        ),
      ],
      children: [
        ...(deleting
          ? [h('div', {class: css.deleteStatus ?? '', role: 'status'}, t('delete.pending'))]
          : []),
        ...(deleteError !== null
          ? [h('div', {class: css.renameError ?? '', role: 'alert'}, deleteError)]
          : []),
      ],
    })
  }
}

if (typeof customElements !== 'undefined' && customElements.get('freddie-workspace-browser') === undefined) {
  customElements.define('freddie-workspace-browser', FreddieWorkspaceBrowser)
}

/**
 * Render the browsing region.
 * @param props - composed slot props (shell owner share + store + injected actions).
 * @returns the region element tree.
 */
export function WorkspaceBrowser(props) {
  const el = document.createElement('freddie-workspace-browser')
  el.setProps(props)
  return el
}
