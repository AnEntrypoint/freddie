// Minimal translation-string catalog. t(key, params, locale) reads from
// src/i18n/locales/<locale>.json. Real UI strings, seeded from
// node_modules/anentrypoint-design/src/components/freddie.js's actual
// label/placeholder/title/children props (via grep, not fabricated).
//
// ICU MessageFormat-lite: plain '{name}' interpolation plus a plural subset
// (Intl.PluralRules category branching: zero/one/two/few/many/other, plus an
// exact-match '=N' override checked first) — enough for freddie's real
// count-driven strings (active agents, tools registered, sessions found)
// without pulling in a full ICU MessageFormat dependency.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = path.join(__dirname, 'locales')

const _cache = new Map()

function loadLocale(locale) {
    if (_cache.has(locale)) return _cache.get(locale)
    const file = path.join(LOCALES_DIR, `${locale}.json`)
    let data = {}
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { data = {} }
    _cache.set(locale, data)
    return data
}

// Real locale files present on disk under src/i18n/locales/*.json — used by
// the coverage-debug row to compare a locale's key set against en.json's
// superset. en.json is always the source of truth; other locales are
// discovered here, not hardcoded, so adding a real locale file is enough to
// make it show up in coverage reporting.
export function listLocales() {
    try { return fs.readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, '')) }
    catch { return [] }
}

export function getLocaleKeys(locale) {
    return Object.keys(loadLocale(locale))
}

// Resolves a plural branch from an ICU-lite pattern:
//   "{count, plural, =0 {no items} one {# item} other {# items}}"
// `#` inside the matched branch is replaced with the literal count.
function resolvePlural(pattern, count) {
    const m = /^\{(\w+),\s*plural,\s*(.+)\}$/s.exec(pattern.trim())
    if (!m) return pattern
    const branchesRaw = m[2]
    const branches = {}
    // Branch syntax is `<selector> {<text>}` repeated — parse by scanning
    // balanced braces rather than a single regex (text can be arbitrary).
    let i = 0
    while (i < branchesRaw.length) {
        const selMatch = /^\s*(=\d+|zero|one|two|few|many|other)\s*\{/.exec(branchesRaw.slice(i))
        if (!selMatch) break
        const selector = selMatch[1]
        let start = i + selMatch[0].length
        let depth = 1
        let j = start
        while (j < branchesRaw.length && depth > 0) {
            if (branchesRaw[j] === '{') depth++
            else if (branchesRaw[j] === '}') depth--
            j++
        }
        branches[selector] = branchesRaw.slice(start, j - 1)
        i = j
    }
    const exact = branches[`=${count}`]
    if (exact !== undefined) return exact.replace(/#/g, String(count))
    let category = 'other'
    try { category = new Intl.PluralRules('en').select(count) } catch {}
    const chosen = branches[category] ?? branches.other ?? ''
    return chosen.replace(/#/g, String(count))
}

export function t(key, params = {}, locale = 'en') {
    const dict = loadLocale(locale)
    let pattern = dict[key]
    if (pattern === undefined) {
        // Fall back to en.json for a missing key in a non-default locale
        // (honest degrade — an untranslated string still renders in English
        // rather than showing a raw key or blank text) before finally
        // falling back to the raw key itself if even en.json lacks it.
        if (locale !== 'en') pattern = loadLocale('en')[key]
        if (pattern === undefined) return key
    }
    if (/^\{(\w+),\s*plural,/.test(pattern.trim()) && 'count' in params) {
        return resolvePlural(pattern, params.count)
    }
    return pattern.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m))
}
