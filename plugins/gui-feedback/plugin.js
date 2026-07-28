// Feedback widget: POST /api/feedback for submission, GET /api/feedback for
// listing (sorted by vote count), POST /api/feedback/:id/vote for voting.
// When GITHUB_TOKEN is configured and `gh` CLI is available, creates a GitHub
// issue per submission; otherwise writes to <FREDDIE_HOME>/feedback/<timestamp>.json.
// Browser-compatible: filesystem and child_process ops are only invoked inside
// route handlers (server-side), never at module-load time.

import { registerDebug } from '../../src/observability/debug.js'

const isBrowser = typeof window !== 'undefined'

// --- Helpers (server-only, only called inside route handlers) ---

async function getFreddieHome() {
    const { getFreddieHome: gfh } = await import('../../src/home.js')
    return gfh()
}

async function getFeedbackDir() {
    const path = await import('node:path')
    const home = await getFreddieHome()
    return path.join(home, 'feedback')
}

// --- GitHub issue helpers ---

async function ghAvailable() {
    if (isBrowser) return false
    if (!process.env.GITHUB_TOKEN) return false
    try {
        const { execFileSync } = await import('node:child_process')
        execFileSync('gh', ['--version'], { encoding: 'utf8', timeout: 5000, stdio: 'pipe' })
        return true
    } catch { return false }
}

async function createGitHubIssue({ title, body, email }) {
    const { execFileSync } = await import('node:child_process')
    let fullBody = body || ''
    if (email) fullBody += `\n\n**Contact:** ${email}`
    const args = ['issue', 'create', '--repo', 'AnEntrypoint/freddie', '--title', title, '--body', fullBody, '--label', 'user-feedback']
    const result = execFileSync('gh', args, { encoding: 'utf8', timeout: 30000, env: { ...process.env } })
    // Output is the issue URL
    return result.trim()
}

async function listGitHubIssues() {
    const { execFileSync } = await import('node:child_process')
    try {
        const raw = execFileSync('gh', [
            'issue', 'list', '--repo', 'AnEntrypoint/freddie',
            '--label', 'user-feedback', '--state', 'open',
            '--json', 'title,number,reactions,createdAt',
            '--limit', '100'
        ], { encoding: 'utf8', timeout: 15000, env: { ...process.env } })
        const issues = JSON.parse(raw)
        return issues.map(issue => ({
            id: 'gh-' + issue.number,
            title: issue.title,
            body: null, // body not included in list
            email: null,
            ts: issue.createdAt,
            votes: (issue.reactions?.['+1'] || 0) + (issue.reactions?.thumbs_up || 0),
            github_issue_url: `https://github.com/AnEntrypoint/freddie/issues/${issue.number}`,
            github_issue_number: issue.number,
            source: 'github',
        }))
    } catch { return [] }
}

async function addGitHubReaction(issueNumber) {
    const { execFileSync } = await import('node:child_process')
    const result = execFileSync('gh', [
        'api', `repos/AnEntrypoint/freddie/issues/${issueNumber}/reactions`,
        '-f', 'content=+1'
    ], { encoding: 'utf8', timeout: 15000, env: { ...process.env } })
    const data = JSON.parse(result)
    return { id: 'gh-' + issueNumber, votes: (data.reactions || data).total_count || 1 }
}

// --- Local file helpers ---

async function loadLocalFeedbackItems() {
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

async function saveLocalFeedbackItem(id, item) {
    if (isBrowser) return
    const fs = await import('node:fs')
    const path = await import('node:path')
    const dir = await getFeedbackDir()
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${id}.json`)
    fs.writeFileSync(file, JSON.stringify(item, null, 2))
}

async function loadLocalFeedbackFile(id) {
    if (isBrowser) return null
    const fs = await import('node:fs')
    const path = await import('node:path')
    const dir = await getFeedbackDir()
    const file = path.join(dir, `${id}.json`)
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
}

async function updateLocalVotes(id) {
    const item = await loadLocalFeedbackFile(id)
    if (!item) return null
    item.votes = (item.votes || 0) + 1
    await saveLocalFeedbackItem(id, item)
    return { id, votes: item.votes }
}

function generateId() {
    return 'fb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

registerDebug('feedback', () => ({
    note: 'POST /api/feedback to submit, GET /api/feedback to list, POST /api/feedback/:id/vote to vote',
    githubRequired: 'GITHUB_TOKEN env var for GitHub issue creation',
}))

export default {
    name: 'gui-feedback', surfaces: 'gui',
    register({ gui }) {
        // POST /api/feedback — submit feedback
        gui.route('POST', '/api/feedback', async (req, res) => {
            try {
                const { title, body, email } = req.body || {}
                if (!title || typeof title !== 'string' || !title.trim()) {
                    return res.status(400).json({ ok: false, error: 'title is required' })
                }
                const id = generateId()
                const ts = new Date().toISOString()
                const item = { id, title: title.trim(), body: body || '', email: email || null, ts, votes: 0 }

                // Try GitHub issue creation if GITHUB_TOKEN is configured
                let githubIssueUrl = null
                if (await ghAvailable()) {
                    try {
                        githubIssueUrl = await createGitHubIssue(item)
                    } catch { /* gh CLI unavailable or token invalid — fall through to file */ }
                }

                if (githubIssueUrl) {
                    return res.json({ ok: true, id, issue_url: githubIssueUrl })
                }

                // Fall back to local file storage
                await saveLocalFeedbackItem(id, item)
                return res.json({ ok: true, id, saved_to: `${id}.json` })
            } catch (e) {
                return res.status(500).json({ ok: false, error: e.message })
            }
        })

        // GET /api/feedback — list feedback items sorted by vote count
        gui.route('GET', '/api/feedback', async (_req, res) => {
            try {
                let items = []

                // Try GitHub issues if available
                if (await ghAvailable()) {
                    try {
                        const ghItems = await listGitHubIssues()
                        items.push(...ghItems)
                    } catch { /* fall through */ }
                }

                // Always include local items
                const localItems = await loadLocalFeedbackItems()
                items.push(...localItems)

                // Sort by votes descending, then by date descending
                items.sort((a, b) => (b.votes || 0) - (a.votes || 0) || new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime())

                return res.json({ ok: true, items })
            } catch (e) {
                return res.status(500).json({ ok: false, error: e.message })
            }
        })

        // POST /api/feedback/:id/vote — increment vote count
        gui.route('POST', '/api/feedback/:id/vote', async (req, res) => {
            try {
                const { id } = req.params
                if (!id) return res.status(400).json({ ok: false, error: 'id is required' })

                // GitHub issues have id prefix 'gh-'
                if (id.startsWith('gh-')) {
                    if (!(await ghAvailable())) {
                        return res.status(400).json({ ok: false, error: 'GitHub integration not available (GITHUB_TOKEN not set)' })
                    }
                    const issueNumber = parseInt(id.slice(3), 10)
                    if (isNaN(issueNumber)) {
                        return res.status(400).json({ ok: false, error: 'invalid GitHub issue id' })
                    }
                    try {
                        const result = await addGitHubReaction(issueNumber)
                        return res.json({ ok: true, id, votes: result.votes })
                    } catch (e) {
                        return res.status(500).json({ ok: false, error: e.message })
                    }
                }

                // Local file
                const result = await updateLocalVotes(id)
                if (!result) {
                    return res.status(404).json({ ok: false, error: 'feedback item not found' })
                }
                return res.json({ ok: true, id, votes: result.votes })
            } catch (e) {
                return res.status(500).json({ ok: false, error: e.message })
            }
        })
    },
}