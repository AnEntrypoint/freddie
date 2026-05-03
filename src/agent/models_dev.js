let _cache = null
const ENDPOINT = 'https://models.dev/api/models.json'
export async function fetchModels({ refresh = false } = {}) {
    if (_cache && !refresh) return _cache
    try { const r = await fetch(ENDPOINT); _cache = await r.json(); return _cache } catch { return _cache || {} }
}
export async function findModel(slug) {
    const data = await fetchModels()
    if (Array.isArray(data)) return data.find(m => m.slug === slug || m.id === slug) || null
    if (data && typeof data === 'object') return data[slug] || null
    return null
}
export function clearCache() { _cache = null }
