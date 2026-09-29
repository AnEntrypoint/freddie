import { en } from '../locales/index.js'

export const FALLBACK_LOCALE = 'en'

export const COMMON_NS = 'common'

const LOCALES = Object.freeze([{ id: FALLBACK_LOCALE, label: 'English' }])

export class LocaleRuntime {
  dicts = new Map()
  bound = new Map()
  snapshot = Object.freeze({ active: FALLBACK_LOCALE, locales: LOCALES, revision: 0 })
  listeners = new Set()

  getLocale() {
    return this.snapshot
  }

  getSnapshot() {
    return this.snapshot
  }

  subscribe(fn) {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  register(ns, localeOrDicts, dict) {
    const pairs = typeof localeOrDicts === 'string'
      ? [[localeOrDicts, dict]]
      : Object.entries(localeOrDicts)
    let locales = this.dicts.get(ns)
    if (!locales) {
      locales = new Map()
      this.dicts.set(ns, locales)
    }
    for (const [locale] of pairs) {
      if (locales.has(locale)) throw new Error(`locale namespace "${ns}" already has locale "${locale}"`)
    }
    for (const [locale, entries] of pairs) locales.set(locale, entries)
    this.publish()
    return () => {
      const owner = this.dicts.get(ns)
      if (!owner) return
      let removed = false
      for (const [locale, entries] of pairs) {
        if (owner.get(locale) === entries) {
          owner.delete(locale)
          removed = true
        }
      }
      if (removed) this.publish()
    }
  }

  bind(ns) {
    let t = this.bound.get(ns)
    if (!t) {
      t = (key, params) => this.translate(ns, key, params)
      this.bound.set(ns, t)
      return t
    }
    return t
  }

  translate(ns, key, params) {
    const template = this.lookup(ns, key)
      ?? (ns !== COMMON_NS ? this.lookup(COMMON_NS, key) : undefined)
      ?? key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, name) =>
      name in params ? String(params[name]) : match)
  }

  lookup(ns, key) {
    return this.dicts.get(ns)?.get(FALLBACK_LOCALE)?.[key]
  }

  publish() {
    this.snapshot = Object.freeze({
      active: FALLBACK_LOCALE,
      locales: LOCALES,
      revision: this.snapshot.revision + 1,
    })
    for (const fn of [...this.listeners]) {
      try {
        fn()
      } catch (error) {
        console.error('locale subscriber crashed:', error)
      }
    }
  }
}

export const inject = ['slots']

export function apply(ctx) {
  const locale = new LocaleRuntime()
  locale.register(COMMON_NS, { en })
  ctx.slots.installLocale(locale)
  ctx.provide('locale', locale)
  if (typeof document !== 'undefined') document.documentElement.lang = FALLBACK_LOCALE
}
