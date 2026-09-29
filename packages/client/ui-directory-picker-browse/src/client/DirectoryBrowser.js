/**
 * The in-app workspace-directory browser (figma Harness 813-23126 family): a
 * 680×500 dialog (clamped to short/narrow viewports — the Miller row scrolls
 * sideways, the columns scroll down) whose header carries the title, the selection-path
 * breadcrumb, and a click-to-edit path zone; below it a Miller view — one
 * full-width level until a row is selected, then two columns splitting the
 * row evenly (256px floor; level | selected folder's children) around a
 * hairline divider. Navigations land selection-anchored and quiet: the
 * previous view keeps rendering while a crumb jump or a submitted path is
 * scanned, then target and parent legs land as one two-pane frame (a slow
 * parent leg falls back to landing the target alone and upgrading in
 * place), so stepping back keeps two panes away from the display root and
 * navigation never flashes an intermediate frame. Selecting in the
 * right column shifts the view one level deeper. "New folder" opens a nested
 * create dialog targeting the selected folder (or the level itself) and
 * selects the created folder. Open adopts the selected folder, falling back
 * to the listed level. Pure consumer of the injected browse calls — the
 * owning flow decides what "Open" means and owns the workspace-creation
 * error surface. Hidden entries are host-flagged and hidden by default; the
 * footer's fixed-label "Show hidden files" toggle (aria-pressed, check when
 * on) reveals them (client-side only). The path editor announces itself with
 * a pencil glyph and a bar-wide hover-lit outline, opens seeded with a
 * trailing separator, and keeps the panes under the draft: the final segment
 * prefix-filters the LAST pane while that pane's level is the one the draft's
 * directory part names (a dot-led prefix also reveals the hidden entries it
 * names, and a prefix nobody matches releases the filter), while any other
 * directory part is scanned after a short debounce and lands like any other
 * navigation — selection-anchored and two-pane away from the display root,
 * both legs waited out so one keystroke moves the view once. The pane arity
 * holds throughout: the last pane is the level the path names and the one
 * beside it is its parent, so typing deeper descends and erasing segments
 * walks back up, moving the Miller view without leaving the editor. Panes the
 * draft walked to stay put when the editor closes (cancellation included):
 * the crumbs name where the walk ended, and Open's fallback target follows
 * them.
 *
 * Converted from a React hooks component to a webjsx custom element: every
 * useState becomes a private field, every ref becomes a private field, every
 * useEffect/useCallback becomes plain instance methods invoked from
 * connectedCallback/disconnectedCallback or directly from event handlers, and
 * re-render is an explicit applyDiff(this, vdom) call (Toast.tsx's pattern)
 * instead of implicit re-render on setState. The nested nulls-vs-nothing
 * scheduling logic (supersession sequence numbers, the slow-scan silence
 * window, the draft-preview debounce) is preserved verbatim as plain fields
 * and timers.
 */
import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import {
  Button, IconCheckOutline16, IconChevronRightOutline14, IconEditOutline16, IconFolderClose16, IconFolderOpen16,
  IconPlusOutline16, renderModal,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import { DirectoryBrowseError } from '@freddie/freddie-client-runtime/client'
import css from './DirectoryBrowser.css.js'

/** Failure text: the Host business message when typed, else the throw's text. */
function failureText(error) {
  if (error instanceof DirectoryBrowseError) return error.rpcError.message
  return error instanceof Error ? error.message : String(error)
}

/**
 * How long a scan may stay visually silent before the floating "Loading…"
 * pill appears. The stale view keeps rendering while a scan is in flight, so
 * a listing that settles inside this window swaps the panes with no
 * intermediate frame at all; only a genuinely slow host (a network mount, a
 * cold disk) surfaces the indicator.
 */
const SLOW_SCAN_DELAY_MS = 300

/**
 * How long a navigation landing waits for its parent leg before committing
 * the target alone. Inside the window both legs land as ONE two-pane frame —
 * no single-pane flash between them; past it the target commits single-pane
 * at once (an Enter-submitted navigation is never held hostage by a stalled
 * parent) and the late parent leg upgrades the landing in place.
 */
const PARENT_LEG_WAIT_MS = 200

/**
 * How long a typed draft rests before the panes follow it to a directory no
 * pane lists. The window absorbs the keystrokes that walk through
 * intermediate directory parts (every character of `/usr/lo` past the
 * separator would otherwise be its own scan) while staying short enough that
 * a pause reads as "the list moved with me".
 */
const DRAFT_PREVIEW_DEBOUNCE_MS = 250

/**
 * Breadcrumb rows for display: inside the home subtree the chain starts at a
 * localized Home crumb; outside it the full ancestry shows, the root labeled
 * by its own path.
 */
function displayCrumbs(listing, homeLabel) {
  const homeIndex = listing.crumbs.findIndex((crumb) => crumb.path === listing.home)
  if (homeIndex === -1) return listing.crumbs
  const tail = listing.crumbs.slice(homeIndex + 1)
  return [{ name: homeLabel, path: listing.home, hidden: false }, ...tail]
}

/**
 * The listing's platform separator, inferred from the home path the host
 * stamped — never from typed text or entry paths, where a backslash is a
 * legal POSIX name character. Still a heuristic at the last step: a POSIX
 * home directory whose own name contains a backslash would misread.
 * TODO: replace with a host-stamped `separator` field on the wire
 * DirectoryListing so the platform fact travels verbatim (the trade-off is
 * recorded in the directory-picker capability seam Agent Note).
 */
function separatorOf(listing) {
  return listing.home.includes('\\') ? '\\' : '/'
}

/** The listed level as a directory part: its own path, separator-terminated (the root already is). */
function levelDirectory(listing) {
  const sep = separatorOf(listing)
  return listing.path.endsWith(sep) ? listing.path : `${listing.path}${sep}`
}

/**
 * The draft's directory part — everything through its last separator — or
 * null while no separator has been typed at all (nothing addresses a
 * directory yet). The platform comes from `listing`: on Windows a forward
 * slash separates too (the host's `resolve` accepts either), while on POSIX a
 * backslash is a legal name character and never separates.
 */
function draftDirectory(listing, draft) {
  const cut = separatorOf(listing) === '\\'
    ? Math.max(draft.lastIndexOf('\\'), draft.lastIndexOf('/'))
    : draft.lastIndexOf('/')
  return cut === -1 ? null : draft.slice(0, cut + 1)
}

/**
 * How the draft reads against one level: the directory part it names, and —
 * when `listing` is the level that directory part addresses — the final
 * segment that prefix-filters it while the user types (case-insensitively,
 * downstream). A level answers a directory part when its own path is that
 * part, or when it is the level that very text just produced (`scanned`): the
 * host resolves what it is given, so `..` segments and Windows forward
 * slashes reach a level whose path spells the request differently.
 * @param listing - the level to read the draft against.
 * @param draft - the current path draft.
 * @param scanned - the last draft-following scan's directory and landing.
 * @returns the draft's directory part (null with no separator typed) and its
 * filtering tail (null when this level does not answer that directory).
 */
function readDraft(listing, draft, scanned) {
  const directory = draftDirectory(listing, draft)
  if (directory === null) return { directory: null, tail: null }
  const answers = directory === levelDirectory(listing)
    || (scanned !== null && scanned.directory === directory && scanned.landed === listing.path)
  return { directory, tail: answers ? draft.slice(directory.length) : null }
}

/**
 * The rows one column renders. The selection is exempt from every filter: it
 * anchors the two-pane view (crumbs and the child pane point at it), so
 * neither the hidden filter after a dot-reveal pick nor a prefix miss may
 * orphan it. A prefix narrows the level only while some row it would actually
 * show matches — a tail nobody matches is a name being spelled, not a demand
 * for an empty pane, so the level shows whole and its hidden rows return to
 * obeying the toggle. Counting only displayable rows is what keeps that true:
 * were a hidden row ever to match a prefix that does not reveal it (today
 * `hidden` means dot-prefixed, so it cannot), the level would narrow to
 * nothing.
 */
function visibleEntries(entries, selectedPath, showHidden, filterPrefix) {
  const needle = filterPrefix === null ? '' : filterPrefix.toLowerCase()
  const displayable = (entry) => showHidden || !entry.hidden || needle.startsWith('.')
  const matches = (entry) => displayable(entry) && entry.name.toLowerCase().startsWith(needle)
  const narrowing = needle !== '' && entries.some(matches)
  return entries.filter((entry) => {
    if (entry.path === selectedPath) return true
    if (narrowing) return matches(entry)
    return showHidden || !entry.hidden
  })
}

/** One column of folder rows (the Miller view renders one or two of these). */
function LevelColumn({ entries, selectedPath, busy, onPick, showHidden, filterPrefix, pathEditing }) {
  const visible = visibleEntries(entries, selectedPath, showHidden, filterPrefix)
  return (
    h('div', {class: css.column ?? '', role: 'list'},
      visible.map((entry) => {
        const selected = entry.path === selectedPath
        return (
          h('span', {role: 'listitem', class: css.rowSeat ?? ''},
            h('button', {
              type: 'button',
              'aria-current': selected ? 'true' : null,
              class: clsx(css.row, selected && css.rowSelected),
              disabled: busy,
              onmousedown: pathEditing ? (event) => { event.preventDefault() } : null,
              onclick: () => { onPick(entry) },
            },
              selected
                ? h(IconFolderOpen16, {size: 16, className: css.rowIconSelected})
                : h(IconFolderClose16, {size: 16, className: css.rowIcon}),
              h('span', {class: css.rowName ?? ''}, entry.name),
              h(IconChevronRightOutline14, {size: 12, className: css.rowChevron}),
            )
          )
        )
      })
    )
  )
}

/**
 * The directory-browser dialog custom element (see module doc). setProps
 * updates `open`/`busy`/`onOpen`/`onClose`/`t`/the browse calls without
 * disturbing in-flight Miller-view state; the open/close edge itself is
 * detected in #render by comparing against the previously rendered `open`.
 */
export class FreddieDirectoryBrowser extends HTMLElement {
  #props = null
  #wasOpen = false

  #parent = null
  #selected = null
  #child = null
  #loading = false
  #slowScan = false
  #slowScanTimer = null
  #error = null
  #pathDraft = null
  #showHidden = false
  #folderDraft = null
  #creatingFolder = false
  #createError = null
  #requestSeq = 0
  #scanController = null
  #openGeneration = 0
  #composing = false
  #scanned = null
  #previewSuspended = false
  #draftDebounceTimer = null

  #refocusPick = false
  #refocusEditZone = false
  #refocusPathInput = false

  #outerModal = null
  #createModal = null

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    this.#props = props
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  disconnectedCallback() {
    this.#requestSeq += 1
    this.#openGeneration += 1
    this.#scanController?.abort()
    this.#stopSlowScanTimer()
    this.#stopDraftDebounce()
    this.#outerModal?.remove()
    this.#outerModal = null
    this.#createModal?.remove()
    this.#createModal = null
  }

  #stopSlowScanTimer() {
    if (this.#slowScanTimer !== null) { window.clearTimeout(this.#slowScanTimer); this.#slowScanTimer = null }
  }

  #stopDraftDebounce() {
    if (this.#draftDebounceTimer !== null) { window.clearTimeout(this.#draftDebounceTimer); this.#draftDebounceTimer = null }
  }

  /** Newer intent wins: invalidate the pending listing's settlement AND abort its wire request. */
  #supersede() {
    this.#scanController?.abort()
    this.#scanController = null
    this.#requestSeq += 1
    return this.#requestSeq
  }

  /** Hide any prior indicator and start a fresh silence window for one listing call. */
  #restartSlowScanWindow() {
    this.#slowScan = false
    this.#stopSlowScanTimer()
    this.#slowScanTimer = window.setTimeout(() => {
      this.#slowScan = true
      this.#render()
    }, SLOW_SCAN_DELAY_MS)
  }

  /** Launch one listing under a fresh controller so a later supersession can abort it. */
  #launchListing(path) {
    const seq = this.#supersede()
    const controller = new AbortController()
    this.#scanController = controller
    this.#restartSlowScanWindow()
    const listDirectory = this.#props?.listDirectory
    /* v8 ignore next -- narrowing guard: launchListing only runs while the element has props. */
    if (listDirectory === undefined) return { seq, scan: Promise.reject(new Error('directory browser: not initialized')) }
    return { seq, scan: listDirectory(path, controller.signal) }
  }

  /**
   * Launch a follow-up listing under the CURRENT supersession seq: a newer
   * intent aborts it like the leg it continues, and it supersedes nothing.
   */
  #continueScan(path) {
    const controller = new AbortController()
    this.#scanController = controller
    this.#restartSlowScanWindow()
    const listDirectory = this.#props?.listDirectory
    /* v8 ignore next -- narrowing guard: continueScan only runs mid-landing, which requires props. */
    if (listDirectory === undefined) return Promise.reject(new Error('directory browser: not initialized'))
    return listDirectory(path, controller.signal)
  }

  /**
   * Replace the whole view with a freshly scanned level. Away from the
   * display root — the same collapse the crumb header renders, so crumbs and
   * pane shape never disagree — the landing is two-pane: the target's ACTUAL
   * parent-level entry re-selected (left pane = parent, right pane = the
   * target), so a crumb jump reads as stepping back one pane. Both legs land
   * as one frame when the parent leg settles within
   * {@link PARENT_LEG_WAIT_MS}; past that bound (or at the display root) the
   * target commits alone — single wide level, loading ends — and a late
   * parent leg still upgrades the landing in place. A failed parent leg, or a
   * truncated parent window that lacks the target, leaves the single-pane
   * landing — the upgrade must never orphan the selection it exists to
   * anchor. Until whichever commit comes first, the previous view keeps
   * rendering: a landing swaps the panes, it never blanks them.
   *
   * Two callers, one landing shape. A submitted path (Enter, a crumb) closes
   * the editor on arrival, announces its failure, and takes the wait bound —
   * it is answering a gesture, so it may not hang on a stalled parent. The
   * editor's own draft-following scan keeps all three to itself: it is
   * speculative, nothing waits on it, and the stale view keeps rendering, so
   * it waits for BOTH legs rather than flashing a single pane it would then
   * upgrade — one keystroke must move the view once. A failure leaves the
   * last readable panes standing and says nothing, while an arrival clears
   * the stale message and re-parks focus the swap dropped.
   * @param path - the level to list; absent lists the Host home directory.
   * @param options - `closeEditor` retires the path draft on arrival and
   * bounds the wait for the parent leg; `announce` surfaces a failure as the
   * dialog's alert.
   */
  #land(path, options) {
    const { seq, scan } = this.#launchListing(path)
    this.#loading = true
    if (options.announce) this.#error = null
    this.#render()
    const settle = () => {
      this.#loading = false
      if (options.closeEditor) {
        this.#pathDraft = null
        return
      }
      this.#error = null
      this.#refocusPathInput = true
    }
    scan.then((target) => {
      if (seq !== this.#requestSeq) return
      if (!options.closeEditor && path !== undefined) this.#scanned = { directory: path, landed: target.path }
      let landed = false
      const landSingle = () => {
        if (landed || seq !== this.#requestSeq) return
        landed = true
        this.#parent = target
        this.#selected = null
        this.#child = null
        settle()
        this.#render()
      }
      if (displayCrumbs(target, '').length < 2) { landSingle(); return }
      const parentCrumb = target.crumbs.at(-2)
      /* v8 ignore next -- narrowing: a two-deep display chain implies a parent crumb (root-to-target inclusive). */
      if (parentCrumb === undefined) { landSingle(); return }
      this.#continueScan(parentCrumb.path).then((parentLevel) => {
        if (seq !== this.#requestSeq) return
        const sep = separatorOf(parentLevel)
        const fold = (value) => (sep === '\\' ? value.toLowerCase() : value)
        const match = parentLevel.entries.find((entry) => fold(entry.path) === fold(target.path))
        if (match === undefined) { landSingle(); return }
        landed = true
        this.#parent = parentLevel
        this.#selected = match
        this.#child = target
        settle()
        this.#render()
      }, () => {
        landSingle()
      })
      if (options.closeEditor) window.setTimeout(landSingle, PARENT_LEG_WAIT_MS)
    }, (reason) => {
      if (seq !== this.#requestSeq) return
      this.#loading = false
      if (options.announce) this.#error = failureText(reason)
      this.#render()
    })
  }

  /** Commit a submitted path (Enter, a crumb, the initial home listing): the editor closes, failures surface. */
  #navigate(path) {
    this.#land(path, { closeEditor: true, announce: true })
  }

  /**
   * Select a row of the listed level and preview its children on the right.
   * Deliberately NOT one-frame like navigate(): a pick's first duty is the
   * immediate selected state on the clicked row, and the pane split IS that
   * feedback (aria-current pill, crumbs following the selection) — holding
   * it back for the child listing would make clicks feel dropped. The quiet
   * rule governs whole-view replacement, where nothing acknowledges the
   * click but the swap itself.
   */
  #select(entry) {
    const { seq, scan } = this.#launchListing(entry.path)
    if (this.#pathDraft !== null) this.#refocusPick = true
    this.#pathDraft = null
    this.#selected = entry
    this.#child = null
    this.#loading = true
    this.#error = null
    this.#render()
    scan.then((next) => {
      if (seq !== this.#requestSeq) return
      this.#child = next
      this.#loading = false
      this.#render()
    }, (reason) => {
      if (seq !== this.#requestSeq) return
      this.#loading = false
      this.#error = failureText(reason)
      this.#selected = null
      this.#refocusEditZone = true
      this.#render()
    })
  }

  /**
   * Walk the panes to the directory the draft addresses, WITHOUT closing the
   * editor. The landing is an ordinary one — selection-anchored and two-pane
   * away from the display root — so typing a path moves the Miller view
   * exactly as a crumb jump does, and the draft's final segment
   * prefix-filters the arrival from the next render on.
   */
  #previewDraftLevel(directory) {
    this.#land(directory, { closeEditor: false, announce: false })
  }

  /** Abandon path editing (Escape or clicking away) and restore the crumb view. */
  #cancelPathEdit() {
    this.#supersede()
    this.#loading = false
    this.#pathDraft = null
    this.#error = null
    if (this.#child === null) this.#selected = null
    if (this.#parent === null) { this.#navigate(); return }
    this.#render()
  }

  /** A right-column pick advances the view one level: child becomes the level. */
  #advance(entry) {
    /* v8 ignore next -- narrowing guard: the right column only renders with a child listing. */
    if (this.#child === null) return
    this.#parent = this.#child
    this.#select(entry)
  }

  #confirmCreate() {
    /* v8 ignore next -- reentry fence: the nested dialog only renders with a target and disables while creating. */
    const targetPath = this.#selected?.path ?? this.#parent?.path ?? null
    if (targetPath === null || this.#folderDraft === null || this.#creatingFolder) return
    const name = this.#folderDraft
    if (name.trim() === '') return
    const createDirectory = this.#props?.createDirectory
    /* v8 ignore next -- narrowing guard: confirmCreate only runs while the element has props. */
    if (createDirectory === undefined) return
    this.#creatingFolder = true
    this.#createError = null
    this.#render()
    const generation = this.#openGeneration
    createDirectory(targetPath, name).then((createdPath) => {
      if (generation !== this.#openGeneration) return
      this.#creatingFolder = false
      this.#folderDraft = null
      const { seq, scan } = this.#launchListing(targetPath)
      this.#loading = true
      this.#error = null
      this.#render()
      scan.then((level) => {
        /* v8 ignore next -- same fence as navigate/select; the modal blocks superseding input */
        if (seq !== this.#requestSeq) return
        this.#parent = level
        this.#loading = false
        this.#select({ name, path: createdPath, hidden: false })
      }, (reason) => {
        /* v8 ignore next -- same fence as navigate/select; the modal blocks superseding input */
        if (seq !== this.#requestSeq) return
        this.#loading = false
        this.#error = failureText(reason)
        this.#render()
      })
    }, (reason) => {
      if (generation !== this.#openGeneration) return
      this.#creatingFolder = false
      this.#createError = failureText(reason)
      this.#render()
    })
  }

  /** Every open starts fresh at the Host home directory; closing invalidates any in-flight response. */
  #onOpenEdge(open) {
    this.#openGeneration += 1
    if (open) {
      this.#parent = null
      this.#selected = null
      this.#child = null
      this.#creatingFolder = false
      this.#showHidden = false
      this.#navigate()
      return
    }
    this.#supersede()
    this.#loading = false
    this.#error = null
    this.#pathDraft = null
    this.#folderDraft = null
    this.#createError = null
    this.#refocusPick = false
    this.#refocusEditZone = false
  }

  /** Arm the draft-preview debounce for the current pathDraft (every keystroke replaces the pending timer). */
  #armDraftDebounce() {
    this.#stopDraftDebounce()
    if (this.#pathDraft === null) return
    this.#draftDebounceTimer = window.setTimeout(() => {
      if (this.#previewSuspended) return
      const current = this.#child ?? this.#parent
      if (current === null || this.#pathDraft === null) return
      const { directory, tail } = readDraft(current, this.#pathDraft, this.#scanned)
      if (directory === null || tail !== null) return
      this.#previewDraftLevel(directory)
    }, DRAFT_PREVIEW_DEBOUNCE_MS)
  }

  #render() {
    const props = this.#props
    if (props === null) { applyDiff(this, h('span', {style: 'display:none'})); return }
    const { open, onClose, busy, t } = props

    if (open !== this.#wasOpen) {
      this.#wasOpen = open
      this.#onOpenEdge(open)
    }

    if (!open) {
      if (this.#outerModal !== null) this.#outerModal = renderModal(this.#outerModal, {open: false})
      if (this.#createModal !== null) this.#createModal = renderModal(this.#createModal, {open: false})
      applyDiff(this, h('span', {style: 'display:none'}))
      return
    }

    const parent = this.#parent
    const selected = this.#selected
    const child = this.#child
    const loading = this.#loading
    const slowScan = this.#slowScan
    const error = this.#error
    const pathDraft = this.#pathDraft
    const showHidden = this.#showHidden
    const folderDraft = this.#folderDraft
    const creatingFolder = this.#creatingFolder
    const createError = this.#createError
    const twoPane = selected !== null
    const parentInert = busy || folderDraft !== null
    const draftPending = pathDraft !== null

    const crumbSource = child ?? parent
    const typedPrefix = crumbSource === null || pathDraft === null
      ? null
      : readDraft(crumbSource, pathDraft, this.#scanned).tail
    const crumbs = crumbSource === null ? [] : displayCrumbs(crumbSource, t('browser.home'))

    /** The folder a create or Open acts on: the selection, else the listed level. */
    const targetPath = selected?.path ?? parent?.path ?? null
    const targetName = selected?.name
      ?? (parent === null ? '' : (displayCrumbs(parent, t('browser.home')).at(-1)?.name ?? parent.path))

    const compositionOn = () => { this.#composing = true }
    const compositionOff = () => { this.#composing = false }

    const outerBody = (
      h('div', {
        class: css.editorScope ?? '',
        onkeydown: (event) => {
          if (event.key !== 'Escape' || this.#pathDraft === null) return
          event.stopPropagation()
          this.#refocusEditZone = document.activeElement === this.querySelector('[data-path-input]')
          this.#cancelPathEdit()
        },
        onblur: (event) => {
          if (this.#pathDraft === null) return
          if (!document.hasFocus()) return
          const target = event.currentTarget
          const card = target.closest('[role="dialog"]')
          /* v8 ignore next -- narrowing guard: this scope always renders inside the Modal card. */
          if (card === null) return
          const related = event.relatedTarget
          if (related instanceof Node && card.contains(related)) return
          this.#refocusEditZone = false
          this.#cancelPathEdit()
        },
      },
        h('div', {class: css.header ?? ''},
          h('h2', {class: css.title ?? ''}, t('browser.title')),
          h('div', {class: css.crumbBar ?? ''},
            pathDraft === null
              ? [
                h('span', {class: css.crumbTrail ?? '', role: 'navigation', 'data-crumb-trail': ''},
                  crumbs.map((crumb, index) => (
                    h('span', {class: css.crumbSeat ?? ''},
                      index > 0 && h(IconChevronRightOutline14, {size: 12, className: css.crumbChevron}),
                      h('button', {
                        type: 'button',
                        class: css.crumb ?? '',
                        disabled: parentInert,
                        onclick: () => { this.#navigate(crumb.path) },
                      },
                        crumb.name,
                      ),
                    )
                  )),
                ),
                h('button', {
                  type: 'button',
                  class: css.crumbEditZone ?? '',
                  'aria-label': t('browser.editPath'),
                  title: t('browser.editPath'),
                  disabled: parentInert,
                  'data-edit-zone': '',
                  onclick: () => {
                    this.#supersede()
                    this.#loading = false
                    this.#previewSuspended = false
                    if (this.#parent === null) {
                      this.#pathDraft = ''
                      this.#render()
                      return
                    }
                    const base = this.#selected?.path ?? this.#parent.path
                    const sep = separatorOf(this.#parent)
                    this.#pathDraft = base.endsWith(sep) ? base : `${base}${sep}`
                    this.#render()
                  },
                },
                  h(IconEditOutline16, {size: 14, className: css.crumbEditGlyph}),
                ),
              ]
              : (
                h('input', {
                  class: css.pathInput ?? '',
                  value: pathDraft,
                  'aria-label': t('browser.editPath'),
                  autofocus: true,
                  'data-path-input': '',
                  disabled: parentInert,
                  oncompositionstart: compositionOn,
                  oncompositionend: compositionOff,
                  oninput: (event) => {
                    this.#supersede()
                    this.#loading = false
                    this.#previewSuspended = false
                    this.#pathDraft = event.target.value
                    this.#armDraftDebounce()
                    this.#render()
                  },
                  onkeydown: (event) => {
                    if (event.key === 'Enter' && !this.#composing) {
                      event.preventDefault()
                      if (this.#pathDraft !== null && this.#pathDraft.trim() !== '') {
                        this.#refocusEditZone = true
                        this.#previewSuspended = true
                        this.#navigate(this.#pathDraft)
                      }
                    }
                  },
                })
              ),
          ),
        ),
        h('div', {class: css.content ?? ''},
          h('div', {class: css.millerRow ?? '', 'data-miller-row': ''},
            parent !== null && (
              h(LevelColumn, {
                entries: parent.entries,
                selectedPath: selected?.path ?? null,
                busy: parentInert,
                onPick: (entry) => { this.#select(entry) },
                showHidden: showHidden,
                filterPrefix: child === null ? typedPrefix : null,
                pathEditing: draftPending,
              })
            ),
            twoPane && h('span', {class: css.divider ?? ''}),
            twoPane && child !== null && (
              h(LevelColumn, {
                entries: child.entries,
                selectedPath: null,
                busy: parentInert,
                onPick: (entry) => { this.#advance(entry) },
                showHidden: showHidden,
                filterPrefix: typedPrefix,
                pathEditing: draftPending,
              })
            ),
          ),
          loading && slowScan
              && h('div', {class: clsx(css.status, css.loadingFloat)}, t('browser.loading')),
          (parent?.truncated === true || child?.truncated === true)
              && h('div', {class: css.status ?? '', role: 'status'}, t('browser.truncated')),
          error !== null && h('div', {class: css.error ?? '', role: 'alert'}, error),
        ),
        h('div', {class: css.footerBar ?? ''},
          h(Button, {
            variant: 'outline',
            icon: h(IconPlusOutline16, {size: 14}),
            disabled: parent === null || loading || parentInert || draftPending,
            onclick: () => {
              this.#folderDraft = ''
              this.#createError = null
              this.#render()
            },
          },
            t('browser.newFolder'),
          ),
          h('button', {
            type: 'button',
            class: clsx(css.showHiddenToggle, showHidden && css.showHiddenToggleActive),
            'aria-pressed': String(showHidden),
            disabled: parentInert,
            onmousedown: draftPending ? (event) => { event.preventDefault() } : null,
            onclick: () => { this.#showHidden = !this.#showHidden; this.#render() },
          },
            t('browser.showHidden'),
            showHidden && h(IconCheckOutline16, {size: 14}),
          ),
          h('span', {class: css.footerGap ?? ''}),
          h(Button, {variant: 'outline', class: clsx(css.footerAction), disabled: parentInert, onclick: onClose}, t('browser.cancel')),
          h(Button, {
            variant: 'primary',
            class: clsx(css.footerAction),
            disabled: targetPath === null || loading || parentInert || draftPending,
            /* v8 ignore next -- narrowing guard: Open disables while no target exists. */
            onclick: () => { if (targetPath !== null) props.onOpen(targetPath) },
          },
            t('browser.open'),
          ),
        ),
      )
    )
    const createBody = (
      h('div', {class: css.createBody ?? ''},
        h('h3', {class: css.createTitle ?? ''}, t('browser.newFolder')),
        h('p', {class: css.createIn ?? ''}, t('browser.createIn', { name: targetName })),
        h('input', {
          class: css.createInput ?? '',
          value: folderDraft ?? '',
          'aria-label': t('browser.folderName'),
          placeholder: t('browser.untitledFolder'),
          autofocus: true,
          disabled: creatingFolder,
          oncompositionstart: compositionOn,
          oncompositionend: compositionOff,
          oninput: (event) => { this.#folderDraft = event.target.value; this.#render() },
          onkeydown: (event) => {
            if (event.key === 'Enter' && !this.#composing) {
              event.preventDefault()
              this.#confirmCreate()
            }
            if (event.key === 'Escape') {
              event.stopPropagation()
              if (!this.#creatingFolder) { this.#folderDraft = null; this.#render() }
            }
          },
        }),
        createError !== null && h('div', {class: css.error ?? '', role: 'alert'}, createError),
        h('div', {class: css.createActions ?? ''},
          h(Button, {variant: 'outline', disabled: creatingFolder, onclick: () => { this.#folderDraft = null; this.#render() }}, t('browser.cancel')),
          h(Button, {
            variant: 'primary',
            disabled: creatingFolder || folderDraft === null || folderDraft.trim() === '',
            onclick: () => { this.#confirmCreate() },
          },
            t('browser.create'),
          ),
        ),
      )
    )

    this.#outerModal = renderModal(this.#outerModal, {
      open,
      onClose: () => { if (folderDraft === null && !busy) onClose() },
      title: t('browser.title'),
      className: clsx(css.dialog),
      headless: true,
      children: outerBody,
    })
    this.#createModal = renderModal(this.#createModal, {
      open: folderDraft !== null,
      onClose: () => { if (!creatingFolder) { this.#folderDraft = null; this.#render() } },
      title: t('browser.newFolder'),
      className: clsx(css.createDialog),
      headless: true,
      children: createBody,
    })
    applyDiff(this, h('span', {style: 'display:none'}))

    const outerModal = this.#outerModal
    const trail = outerModal.querySelector('[data-crumb-trail]')
    if (trail !== null) trail.scrollLeft = trail.scrollWidth
    if (child !== null) {
      const row = outerModal.querySelector('[data-miller-row]')
      if (row !== null) row.scrollLeft = row.scrollWidth
    }
    if (this.#refocusPathInput) {
      this.#refocusPathInput = false
      if (document.activeElement === document.body) outerModal.querySelector('[data-path-input]')?.focus()
    }
    if (pathDraft === null) {
      if (this.#refocusPick) {
        this.#refocusPick = false
        this.#refocusEditZone = false
        const rowHost = outerModal.querySelector('[data-miller-row]')
        /* v8 ignore next -- narrowing guard: the miller row is mounted whenever a pick just committed. */
        if (rowHost !== null) {
          const row = rowHost.querySelector('button[aria-current="true"]')
          /* v8 ignore next -- narrowing guard: the pick that set the flag just rendered its aria-current row. */
          row?.focus()
        }
      } else if (this.#refocusEditZone) {
        this.#refocusEditZone = false
        if (document.activeElement === document.body) {
          outerModal.querySelector('[data-edit-zone]')?.focus()
        }
      }
    }
  }
}

defineElement('freddie-directory-browser', FreddieDirectoryBrowser)

/**
 * Convenience wrapper preserving the original function-component call shape:
 * creates (or reuses) the `freddie-directory-browser` element, sets props, and
 * returns it cast to `JSX.Element` for a `<DirectoryBrowser .../>` call site
 * (mirrors ui-primitives' `Modal`/`Toast` convenience-wrapper pattern). The
 * element self-mounts nowhere special — the flow occupant returns it as a
 * normal vdom child, unlike Toast/Modal's document.body attachment.
 */
export function DirectoryBrowser(props) {
  const el = document.createElement('freddie-directory-browser')
  el.setProps(props)
  return el
}
