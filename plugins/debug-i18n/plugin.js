// registerDebug('i18n', ...) — per-locale key coverage against en.json's
// superset. With only en.json existing initially this correctly reports
// 100pct for en and an empty missing-key list for every other locale (there
// are none yet) — an honest empty state, not fabricated numbers.
import { listLocales, getLocaleKeys } from '../../src/i18n/catalog.js'
import { registerDebug } from '../../src/observability/debug.js'

function snapshot() {
    const locales = listLocales()
    const enKeys = new Set(getLocaleKeys('en'))
    const coverage = locales.map(locale => {
        const keys = new Set(getLocaleKeys(locale))
        const missing = [...enKeys].filter(k => !keys.has(k))
        const pct = enKeys.size ? Math.round(((enKeys.size - missing.length) / enKeys.size) * 100) : 100
        return { locale, key_count: keys.size, missing_count: missing.length, coverage_pct: pct, missing_keys: missing }
    })
    return { total_keys_in_en: enKeys.size, locales: coverage }
}

export default {
    name: 'debug-i18n', surfaces: 'pi',
    register() {
        registerDebug('i18n', snapshot)
    },
}
