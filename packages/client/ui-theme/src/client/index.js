import { webjsxSlot } from '@freddie/freddie-client-ui-slots'
import './AppearanceRow.js'
import { createAppearanceRowStore } from './settings-store.js'
import { installThemeStyles } from './styles.js'
import { en } from './locales.js'
import {
  DEFAULT_PREFERENCE, isThemePreference, THEME_PREFERENCE_FIELD, THEME_SETTINGS_NAMESPACE,
} from '../theme-settings.js'

export const SETTINGS_NS = 'settings.theme'

const BUILTIN_THEMES = Object.freeze([
  Object.freeze({ id: 'light', colorScheme: 'light', tokens: Object.freeze({}) }),
  Object.freeze({ id: 'dark', colorScheme: 'dark', tokens: Object.freeze({}) }),
])

const BUILTIN_INSPECT_TOKENS = Object.freeze([
  { name: '--freddie-alias-bg-base', description: 'Application base background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--freddie-alias-bg-base' },
  { name: '--freddie-alias-bg-layer-1', description: 'Primary raised surface background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--freddie-alias-bg-layer-1' },
  { name: '--freddie-alias-bg-layer-2', description: 'Secondary nested surface background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--freddie-alias-bg-layer-2' },
  { name: '--freddie-alias-bg-overlay', description: 'Overlay and popover background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--freddie-alias-bg-overlay' },
  { name: '--freddie-alias-border-l1', description: 'Primary subtle border.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--freddie-alias-border-l1' },
  { name: '--freddie-alias-border-l2', description: 'Secondary stronger border.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--freddie-alias-border-l2' },
  { name: '--freddie-alias-brand-primary', description: 'Primary brand accent.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--freddie-alias-brand-primary' },
  { name: '--freddie-alias-label-primary', description: 'Primary text color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--freddie-alias-label-primary' },
  { name: '--freddie-alias-label-secondary', description: 'Secondary text color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--freddie-alias-label-secondary' },
  { name: '--freddie-alias-state-error-primary', description: 'Primary error state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--freddie-alias-state-error-primary' },
  { name: '--freddie-alias-state-success-primary', description: 'Primary success state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--freddie-alias-state-success-primary' },
  { name: '--freddie-alias-state-warn-primary', description: 'Primary warning state color.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--freddie-alias-state-warn-primary' },
  { name: '--dsw-specific-sidebar-fill', description: 'Sidebar column and title-row background.', valueType: 'CSS color', requiresLightAndDark: true, cssVariable: '--dsw-specific-sidebar-fill' },
])

export class ThemeRuntime {
  ctx
  host
  themes = [...BUILTIN_THEMES]
  preference
  revision = 0
  snapshot
  media
  overrides = new Map()
  overrideSeq = 0

  constructor(ctx, host) {
    this.ctx = ctx
    this.host = host
    this.preference = DEFAULT_PREFERENCE
    this.media = typeof matchMedia === 'undefined' ? undefined : matchMedia('(prefers-color-scheme: dark)')
    this.snapshot = this.buildSnapshot()
    if (this.media !== undefined) {
      const media = this.media
      const onChange = () => {
        if (this.preference !== 'system') return
        this.publish()
      }
      ctx.effect(() => {
        media.addEventListener('change', onChange)
        return () => { media.removeEventListener('change', onChange) }
      }, 'ui-theme: prefers-color-scheme listener')
    }
    ctx.effect(() => host.subscribe(() => { this.adopt() }), 'ui-theme: settings scope adoption')
    this.adopt()
  }

  getTheme() {
    return this.snapshot
  }

  exportInspectTokens() {
    const tokens = new Map(BUILTIN_INSPECT_TOKENS.map(token => [token.name, token]))
    for (const theme of this.themes) {
      for (const name of Object.keys(theme.tokens)) {
        if (!tokens.has(name)) tokens.set(name, dynamicToken(name))
      }
    }
    for (const layer of this.overrides.values()) {
      for (const name of Object.keys(layer.tokens)) {
        if (!tokens.has(name)) tokens.set(name, dynamicToken(name))
      }
    }
    return [...tokens.values()].map(token => ({ ...token })).sort((left, right) => left.name.localeCompare(right.name))
  }

  setTheme(id) {
    if (id !== 'system' && !this.themes.some(t => t.id === id)) {
      throw new Error(`theme "${id}" is not registered`)
    }
    if (this.preference === id) return
    this.preference = id
    if (isThemePreference(id)) void this.host.set(THEME_PREFERENCE_FIELD, id)
    this.publish()
  }

  adopt() {
    const section = this.host.getSnapshot().value
    if (section === undefined || this.preference === section.preference) return
    this.preference = section.preference
    this.publish()
  }

  register(definition) {
    if (definition.id === 'system') throw new Error('"system" is a preference, not a registrable theme id')
    if (this.themes.some(t => t.id === definition.id)) {
      throw new Error(`theme "${definition.id}" is already registered`)
    }
    this.themes = [...this.themes, definition]
    this.publish()
    return () => {
      if (!this.themes.some(t => t.id === definition.id)) return
      this.themes = this.themes.filter(t => t.id !== definition.id)
      if (this.preference === definition.id) {
        this.preference = DEFAULT_PREFERENCE
      }
      this.publish()
    }
  }

  overrideTokens(source, tokens) {
    const layer = { seq: this.overrideSeq++, tokens: validateOverrides(source, tokens) }
    this.overrides.set(source, layer)
    this.publish()
    return () => {
      if (this.overrides.get(source) !== layer) return
      this.overrides.delete(source)
      this.publish()
    }
  }

  buildSnapshot() {
    const resolvedId = this.preference === 'system'
      ? (this.media?.matches === true ? 'dark' : 'light')
      : this.preference
    const active = this.themes.find(t => t.id === resolvedId)
    /* v8 ignore next 2 */
    if (active === undefined) throw new Error(`theme registry lost "${resolvedId}"`)
    return Object.freeze({
      preference: this.preference,
      active: this.composeActive(active),
      themes: Object.freeze([...this.themes]),
      revision: this.revision,
    })
  }

  composeActive(active) {
    if (this.overrides.size === 0) return active
    const tokens = { ...active.tokens }
    for (const layer of [...this.overrides.values()].sort((a, b) => a.seq - b.seq)) {
      for (const [name, modes] of Object.entries(layer.tokens)) {
        tokens[name] = modes[active.colorScheme]
      }
    }
    return Object.freeze({ ...active, tokens: Object.freeze(tokens) })
  }

  publish() {
    this.revision += 1
    this.snapshot = this.buildSnapshot()
    this.ctx.emit('theme/change', this.snapshot)
  }
}

function validateOverrides(source, tokens) {
  const validated = {}
  for (const [name, value] of Object.entries(tokens)) {
    if (typeof value === 'string') {
      throw new TypeError(
        `theme override "${name}" from "${source}" is a bare string — pass { light: ${JSON.stringify(value)}, dark: ${JSON.stringify(value)} } `
        + '(repeat the value when it is the same in both palettes); a single value goes illegible when the user switches color scheme',
      )
    }
    if (typeof value !== 'object' || value === null
      || typeof value.light !== 'string'
      || typeof value.dark !== 'string') {
      throw new TypeError(
        `theme override "${name}" from "${source}" must map to a { light, dark } pair of strings — one value per color scheme`,
      )
    }
    const modes = value
    validated[name] = { light: modes.light, dark: modes.dark }
  }
  return validated
}

function dynamicToken(name) {
  return {
    name,
    description: 'Theme token registered by the current Client composition.',
    valueType: 'CSS value',
    requiresLightAndDark: true,
    ...(name.startsWith('--') ? { cssVariable: name } : {}),
  }
}

export const inject = ['slots', 'locale', 'connection', 'remote', 'settingsScope']

export function apply(ctx) {
  installThemeStyles(ctx)
  const host = ctx.settingsScope.bind({ namespace: THEME_SETTINGS_NAMESPACE })
  const theme = new ThemeRuntime(ctx, host)
  ctx.provide('theme', theme)

  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { en }), 'ui-theme: settings row dictionaries')

  const store = createAppearanceRowStore()
  let bound
  const sync = (snapshot) => {
    bound?.sync(snapshot.preference, snapshot.revision)
  }
  ctx.on('theme/change', sync)
  const injected = (actions) => {
    bound = actions
    sync(theme.getTheme())
    return {
      setTheme: (id) => { theme.setTheme(id) },
    }
  }
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'appearance',
    order: 10,
    store,
    locale: SETTINGS_NS,
    inject: injected,
  }, webjsxSlot('freddie-theme-appearance-row')))
}
