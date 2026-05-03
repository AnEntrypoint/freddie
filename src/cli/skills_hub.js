const HUB_INDEX = 'https://raw.githubusercontent.com/AnEntrypoint/freddie-skills/main/index.json'
export async function fetchHub() { try { const r = await fetch(HUB_INDEX); return r.ok ? await r.json() : { items: [], error: 'fetch ' + r.status } } catch (e) { return { items: [], error: String(e.message || e) } } }
export async function searchHub(query) {
    const data = await fetchHub()
    if (data.error) return data
    const q = String(query || '').toLowerCase()
    return { items: (data.items || data || []).filter(i => !q || (i.name + ' ' + (i.description || '')).toLowerCase().includes(q)) }
}
