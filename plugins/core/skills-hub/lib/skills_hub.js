import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../../../../src/home.js'
const HUB_INDEX_URL = 'https://raw.githubusercontent.com/AnEntrypoint/freddie-skills/main/index.json'

// `name` used to reach path.join(skillsRoot, name) unvalidated -- a name like
// '../../../../evil' escaped skillsRoot entirely (live-witnessed: resolved to
// C:\evil-outside-skills-dir from ~/.freddie/skills). Only a simple identifier
// (letters/digits/dash/underscore) is a legitimate skill name; anything else
// is rejected rather than sanitized, since silently mangling a traversal
// attempt into "looks safe now" is worse than a clear error naming the reason.
const SAFE_NAME = /^[A-Za-z0-9_-]+$/
// SKILL.md content becomes future-turn context (src/skills/index.js's loader)
// the moment install() succeeds -- a large body is a persistence-cost signal
// worth bounding even though content-shape validation itself is a separate,
// harder policy question this cap doesn't attempt to solve.
const MAX_BODY_BYTES = 64 * 1024

function skillsRoot() { return path.join(getFreddieHome(), 'skills') }
function skillDirFor(name) {
    if (typeof name !== 'string' || !SAFE_NAME.test(name)) return null
    const root = skillsRoot()
    const dir = path.join(root, name)
    // Defense in depth beyond the regex: confirm the resolved path still
    // lands inside skillsRoot before any fs call touches it.
    if (dir !== root && !dir.startsWith(root + path.sep)) return null
    return dir
}

const ACTIONS = {
    catalog: async () => {
        try { const r = await fetch(HUB_INDEX_URL); if (!r.ok) return { items: [], error: 'fetch ' + r.status }; return { items: await r.json() } }
        catch (e) { return { items: [], error: String(e.message || e) } }
    },
    install: async ({ name, body }) => {
        if (!name || !body) return { error: 'name + body required' }
        const dir = skillDirFor(name)
        if (!dir) return { error: 'invalid skill name: must match ' + SAFE_NAME.source }
        if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) return { error: `body too large (max ${MAX_BODY_BYTES} bytes)` }
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'SKILL.md'), body, 'utf8')
        return { installed: name }
    },
    uninstall: async ({ name }) => {
        const dir = skillDirFor(name)
        if (!dir) return { error: 'invalid skill name: must match ' + SAFE_NAME.source }
        if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); return { uninstalled: name } }
        return { error: 'not found' }
    },
}
export const skillsHubTool = ({
    name: 'skills_hub',
    toolset: 'core',
    schema: { name: 'skills_hub', description: 'Browse and install community skills.', parameters: { type: 'object', properties: { action: { type: 'string', enum: Object.keys(ACTIONS) }, name: { type: 'string' }, body: { type: 'string' } }, required: ['action'] } },
    handler: async (a) => { const fn = ACTIONS[a.action]; return fn ? await fn(a) : { error: 'unknown action' } },
})
