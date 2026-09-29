import { applyDiff, createElement as h } from '@freddie/webjsx'
import clsx from 'clsx'
import {
  Button, IconCheckOutline16, IconChevronRightOutline14, IconEditOutline16, IconFolderClose16, IconFolderOpen16,
  IconPlusOutline16, renderModal,
  defineElement,
} from '@freddie/freddie-client-ui-primitives'
import { DirectoryBrowseError } from '@freddie/freddie-client-runtime/client'
import css from './DirectoryBrowser.css.js'

function failureText(error) {
  if (error instanceof DirectoryBrowseError) return error.rpcError.message
  return error instanceof Error ? error.message : String(error)
}

const SLOW_SCAN_DELAY_MS = 300

const PARENT_LEG_WAIT_MS = 200

const DRAFT_PREVIEW_DEBOUNCE_MS = 250

function displayCrumbs(listing, homeLabel) {
  const homeIndex = listing.crumbs.findIndex((crumb) => crumb.path === listing.home)
  if (homeIndex === -1) return listing.crumbs
  const tail = listing.crumbs.slice(homeIndex + 1)
  return [{ name: homeLabel, path: listing.home, hidden: false }, ...tail]
}

function separatorOf(listing) {
  return listing.home.includes('\\') ? '\\' : '/'
}

function levelDirectory(listing) {
  const sep = separatorOf(listing)
  return listing.path.endsWith(sep) ? listing.path : `${listing.path}${sep}`
}

function draftDirectory(listing, draft) {
  const cut = separatorOf(listing) === '\\'
    ? Math.max(draft.lastIndexOf('\\'), draft.lastIndexOf('/'))
    : draft.lastIndexOf('/')
  return cut === -1 ? null : draft.slice(0, cut + 1)
}

function readDraft(listing, draft, scanned) {
  const directory = draftDirectory(listing, draft)
  if (directory === null) return { directory: null, tail: null }
  const answers = directory === levelDirectory(listing)
    || (scanned !== null && scanned.directory === directory && scanned.landed === listing.path)
  return { directory, tail: answers ? draft.slice(directory.length) : null }
}

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

  #supersede() {
    this.#scanController?.abort()
    this.#scanController = null
    this.#requestSeq += 1
    return this.#requestSeq
  }

  #restartSlowScanWindow() {
    this.#slowScan = false
    this.#stopSlowScanTimer()
    this.#slowScanTimer = window.setTimeout(() => {
      this.#slowScan = true
      this.#render()
    }, SLOW_SCAN_DELAY_MS)
  }

  #launchListing(path) {
    const seq = this.#supersede()
    const controller = new AbortController()
    this.#scanController = controller
    this.#restartSlowScanWindow()
    const listDirectory = this.#props?.listDirectory
    /* v8 ignore next */
    if (listDirectory === undefined) return { seq, scan: Promise.reject(new Error('directory browser: not initialized')) }
    return { seq, scan: listDirectory(path, controller.signal) }
  }

  #continueScan(path) {
    const controller = new AbortController()
    this.#scanController = controller
    this.#restartSlowScanWindow()
    const listDirectory = this.#props?.listDirectory
    /* v8 ignore next */
    if (listDirectory === undefined) return Promise.reject(new Error('directory browser: not initialized'))
    return listDirectory(path, controller.signal)
  }

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
      /* v8 ignore next */
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

  #navigate(path) {
    this.#land(path, { closeEditor: true, announce: true })
  }

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

  #previewDraftLevel(directory) {
    this.#land(directory, { closeEditor: false, announce: false })
  }

  #cancelPathEdit() {
    this.#supersede()
    this.#loading = false
    this.#pathDraft = null
    this.#error = null
    if (this.#child === null) this.#selected = null
    if (this.#parent === null) { this.#navigate(); return }
    this.#render()
  }

  #advance(entry) {
    /* v8 ignore next */
    if (this.#child === null) return
    this.#parent = this.#child
    this.#select(entry)
  }

  #confirmCreate() {
    /* v8 ignore next */
    const targetPath = this.#selected?.path ?? this.#parent?.path ?? null
    if (targetPath === null || this.#folderDraft === null || this.#creatingFolder) return
    const name = this.#folderDraft
    if (name.trim() === '') return
    const createDirectory = this.#props?.createDirectory
    /* v8 ignore next */
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
        /* v8 ignore next */
        if (seq !== this.#requestSeq) return
        this.#parent = level
        this.#loading = false
        this.#select({ name, path: createdPath, hidden: false })
      }, (reason) => {
        /* v8 ignore next */
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
          /* v8 ignore next */
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
            /* v8 ignore next */
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
        /* v8 ignore next */
        if (rowHost !== null) {
          const row = rowHost.querySelector('button[aria-current="true"]')
          /* v8 ignore next */
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

export function DirectoryBrowser(props) {
  const el = document.createElement('freddie-directory-browser')
  el.setProps(props)
  return el
}
