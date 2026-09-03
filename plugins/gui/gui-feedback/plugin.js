// Feedback widget: POST /api/feedback for submission, GET /api/feedback for
// listing (sorted by vote count), POST /api/feedback/:id/vote for voting.
// When GITHUB_TOKEN is configured and `gh` CLI is available, creates a GitHub
// issue per submission; otherwise writes to <FREDDIE_HOME>/feedback/<timestamp>.json.
// Browser-compatible: filesystem and child_process ops are only invoked inside
// route handlers (server-side), never at module-load time.

import { registerDebug } from '../../../src/observability/debug.js'
import { ghAvailable, createGitHubIssue, listGitHubIssues, addGitHubReaction } from './github-backend.js'
import { loadLocalFeedbackItems, saveLocalFeedbackItem, updateLocalVotes } from './local-backend.js'

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