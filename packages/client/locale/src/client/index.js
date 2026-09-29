/**
 * Browser-side locale registry. English is the only shipped language, so the
 * registry is a namespaced dictionary store with a stable bound-translate
 * identity for injected consumers and no language preference of its own.
 */
import { en } from '../locales/index.js'

/** The single shipped locale and the dictionary every lookup reads. */
export const FALLBACK_LOCALE = 'en'

/** Shared namespace for shell-level texts. */
export const COMMON_NS = 'common'

const LOCALES = Object.freeze([{ id: FALLBACK_LOCALE, label: 'English' }])

/**
 * Dictionary registry. Lookup chain per key: the entry's namespace ->
 * the shared common namespace -> the key itself (missing text stays visible,
 * fail loud in the UI rather than blank). Reads go through {@link getLocale};
 * continuous sync through the LocaleFace getSnapshot/subscribe pair the render
 * machinery consumes (installed via `ctx.slots.installLocale`).
 */
export class LocaleRuntime {
  dicts = new Map()
  bound = new Map()
  snapshot = Object.freeze({ active: FALLBACK_LOCALE, locales: LOCALES, revision: 0 })
  listeners = new Set()

  /**
   * Read the current immutable locale snapshot.
   * @returns the current snapshot (stable reference until the next change).
   */
  getLocale() {
    return this.snapshot
  }

  /**
   * LocaleFace getSnapshot: the current snapshot (carries `revision`; stable
   * reference between changes, uSES-safe).
   * @returns the current snapshot.
   */
  getSnapshot() {
    return this.snapshot
  }

  /**
   * LocaleFace subscribe: notified on every snapshot change (dictionary
   * registration bumps the revision so already rendered outlets pick up
   * late-arriving dictionaries).
   * @param fn - change callback.
   * @returns unsubscribe.
   */
  subscribe(fn) {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /**
   * Register a declared namespace's dictionaries, all locales in one call, or
   * the single-locale untyped form for namespaces outside the merge table
   * (dynamic composition, tests). Duplicate (ns, locale) throws (single
   * occupant; a namespace's texts have one owner). Registration bumps the
   * revision so mounted outlets pick up late-arriving dictionaries.
   * @param ns - a namespace merged into LocaleNamespaceMap, or a plain namespace string.
   * @param localeOrDicts - complete dictionaries keyed by locale id, or a single locale tag.
   * @param dict - dictionary, when the single-locale form is used.
   * @returns disposer removing every locale registered by this call (idempotent).
   */
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

  /**
   * Bind a declared namespace to a translate function typed to its
   * dictionary key union (plus the shared common vocabulary) — the same key
   * domain the framework-injected `t` seat carries. The returned reference
   * is stable per namespace (repeat binds return the same function), so it
   * can ride inject surfaces without breaking memoization.
   * @param ns - a namespace merged into LocaleNamespaceMap, or a plain namespace string.
   * @returns the translate function.
   */
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

  /** Advance the snapshot revision and notify LocaleFace subscribers (render refresh). */
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

/** Required services: slot registration. */
export const inject = ['slots']

/**
 * Client plugin body: provide the locale service with the common dictionary.
 * @param ctx - client cordis context.
 */
export function apply(ctx) {
  const locale = new LocaleRuntime()
  locale.register(COMMON_NS, { en })
  ctx.slots.installLocale(locale)
  ctx.provide('locale', locale)
  if (typeof document !== 'undefined') document.documentElement.lang = FALLBACK_LOCALE
}
