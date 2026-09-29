import { applyDiff, createElement as h } from '@freddie/webjsx'
import { IconChevronDownOutline14, IconRightUpOutline14, defineElement, mountToast } from '@freddie/freddie-client-ui-primitives'
import { appLabelKey } from './applications.js'
import css from './OpenInAppAction.css.js'

const ITEM_PREFIX = 'app:'

/**
 * Session-header split button: the primary half opens the session workspace in
 * the remembered (else first) installed application, the chevron lists the rest.
 * Renders nothing until the host has answered with at least one application and
 * the session has a working directory, so a refused or unreachable host never
 * leaves a broken control behind.
 */
export class FreddieOpenInAppAction extends HTMLElement {
  #props = null
  #apps = null
  #loading = false
  #open = false
  #pending = false
  #brokenIcons = new Set()

  /** Set/replace props and re-render; call after creating or updating the element. */
  setProps(props) {
    this.#props = props
    this.#adoptApps()
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #adoptApps() {
    const props = this.#props
    if (this.#apps !== null || props === null) return
    const known = props.knownApps()
    if (known !== null) {
      this.#apps = known
      return
    }
    if (this.#loading) return
    this.#loading = true
    void props.loadApps().then((apps) => {
      this.#apps = apps
      this.#render()
    })
  }

  #setOpen(open, restoreFocus = false) {
    if (this.#open === open) return
    this.#open = open
    this.#render()
    if (open) this.querySelector('[role="menuitem"]')?.focus()
    else if (restoreFocus) this.querySelector(`.${css.chevron}`)?.focus()
  }

  async #launch(appId, cwd) {
    const props = this.#props
    if (this.#pending || props === null) return
    this.#pending = true
    this.#render()
    const launched = await props.launch(appId, cwd)
    this.#pending = false
    if (launched) props.remember(appId)
    else this.#announceFailure()
    this.#render()
  }

  #announceFailure() {
    const toast = mountToast({ text: this.#props.t('open.error'), onDone: () => { toast.remove() } })
  }

  #icon(appId, size) {
    if (this.#brokenIcons.has(appId)) return h(IconRightUpOutline14, {})
    return h('img', {
      src: this.#props.iconUrl(appId),
      width: size,
      height: size,
      alt: '',
      draggable: false,
      class: css.appIcon ?? '',
      onerror: () => {
        this.#brokenIcons.add(appId)
        this.#render()
      },
    })
  }

  #render() {
    const props = this.#props
    if (props === null) return
    const cwd = props.useSessions(state => state.byId[props.sessionId]?.cwd)
    const apps = this.#apps ?? []
    if (typeof cwd !== 'string' || cwd === '' || apps.length === 0) {
      this.#open = false
      applyDiff(this, [])
      return
    }
    const { t } = props
    const remembered = props.choice()
    const preferred = apps.includes(remembered) ? remembered : apps[0]
    const label = t('open.title', { app: t(appLabelKey(preferred)) })
    const open = this.#open
    const busy = this.#pending

    const anchor = h('div', { class: css.split ?? '', role: 'group', 'aria-label': t('group.aria') },
      h('button', {
        type: 'button',
        class: css.main ?? '',
        title: label,
        'aria-label': label,
        'aria-disabled': String(busy),
        onclick: () => { if (!busy) void this.#launch(preferred, cwd) },
      }, this.#icon(preferred, 14)),
      h('button', {
        type: 'button',
        class: css.chevron ?? '',
        title: t('menu.more'),
        'aria-label': t('menu.more'),
        'aria-haspopup': 'menu',
        'aria-expanded': String(open),
        'aria-disabled': String(busy),
        onclick: () => { if (!busy) this.#setOpen(!open) },
        onkeydown: (event) => {
          if (busy || open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
          event.preventDefault()
          event.stopPropagation()
          this.#setOpen(true)
        },
      }, h(IconChevronDownOutline14, { className: open ? css.chevronOpen : undefined })),
    )

    const menuProps = {
      open,
      dense: true,
      align: 'end',
      anchor,
      items: apps.map(appId => ({
        id: `${ITEM_PREFIX}${appId}`,
        icon: this.#icon(appId, 16),
        label: appId === preferred ? t('menu.default', { app: t(appLabelKey(appId)) }) : t(appLabelKey(appId)),
      })),
      onSelect: (itemId) => {
        this.#setOpen(false, true)
        void this.#launch(itemId.slice(ITEM_PREFIX.length), cwd)
      },
      onClose: () => { this.#setOpen(false) },
    }

    applyDiff(this, h('freddie-menu', {
      ref: (node) => { node?.setProps(menuProps) },
      onkeydown: (event) => {
        if (event.key !== 'Escape' || !this.#open) return
        this.#setOpen(false, true)
      },
      onfocusout: (event) => {
        if (this.#open && event.relatedTarget instanceof Node && !this.contains(event.relatedTarget)) this.#setOpen(false)
      },
    }))
  }
}

defineElement('freddie-open-in-app-action', FreddieOpenInAppAction)
