// GitHub issue backend for the feedback widget: creates/lists/reacts to
// issues via the `gh` CLI when GITHUB_TOKEN is configured.

const isBrowser = typeof window !== 'undefined'

export async function ghAvailable() {
    if (isBrowser) return false
    if (!process.env.GITHUB_TOKEN) return false
    try {
        const { execFileSync } = await import('node:child_process')
        execFileSync('gh', ['--version'], { encoding: 'utf8', timeout: 5000, stdio: 'pipe' })
        return true
    } catch { return false }
}

export async function createGitHubIssue({ title, body, email }) {
    const { execFileSync } = await import('node:child_process')
    let fullBody = body || ''
    if (email) fullBody += `\n\n**Contact:** ${email}`
    const args = ['issue', 'create', '--repo', 'AnEntrypoint/freddie', '--title', title, '--body', fullBody, '--label', 'user-feedback']
    const result = execFileSync('gh', args, { encoding: 'utf8', timeout: 30000, env: { ...process.env } })
    // Output is the issue URL
    return result.trim()
}

export async function listGitHubIssues() {
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

export async function addGitHubReaction(issueNumber) {
    const { execFileSync } = await import('node:child_process')
    const result = execFileSync('gh', [
        'api', `repos/AnEntrypoint/freddie/issues/${issueNumber}/reactions`,
        '-f', 'content=+1'
    ], { encoding: 'utf8', timeout: 15000, env: { ...process.env } })
    const data = JSON.parse(result)
    return { id: 'gh-' + issueNumber, votes: (data.reactions || data).total_count || 1 }
}
