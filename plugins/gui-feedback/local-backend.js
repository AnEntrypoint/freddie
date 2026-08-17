// Local-file feedback backend: <FREDDIE_HOME>/feedback/<id>.json — used when
// no GITHUB_TOKEN/gh CLI is available, or alongside GitHub as the vote store
// for locally-submitted items.

const isBrowser = typeof window !== 'undefined'

async function getFreddieHome() {
    const { getFreddieHome: gfh } = await import('../../src/home.js')
    return gfh()
}

async function getFeedbackDir() {
    const path = await import('node:path')
    const home = await getFreddieHome()
    return path.join(home, 'feedback')
}

export async function loadLocalFeedbackItems() {
    if (isBrowser) return []
    const fs = await import('node:fs')
    const path = await import('node:path')
    const dir = await getFeedbackDir()
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        const items = []
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.json')) continue
            try {
                const raw = fs.readFileSync(path.join(dir, entry.name), 'utf8')
                const item = JSON.parse(raw)
                item.source = 'local'
                items.push(item)
            } catch { /* skip corrupt files */ }
        }
        return items
    } catch { return [] }
}

export async function saveLocalFeedbackItem(id, item) {
    if (isBrowser) return
    const fs = await import('node:fs')
    const path = await import('node:path')
    const dir = await getFeedbackDir()
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${id}.json`)
    fs.writeFileSync(file, JSON.stringify(item, null, 2))
}

export async function loadLocalFeedbackFile(id) {
    if (isBrowser) return null
    const fs = await import('node:fs')
    const path = await import('node:path')
    const dir = await getFeedbackDir()
    const file = path.join(dir, `${id}.json`)
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

export async function updateLocalVotes(id) {
    const item = await loadLocalFeedbackFile(id)
    if (!item) return null
    item.votes = (item.votes || 0) + 1
    await saveLocalFeedbackItem(id, item)
    return { id, votes: item.votes }
}
