import { listSkills } from '../../../src/skills/index.js'
import { COMMANDS_BY_CATEGORY } from '../../../src/commands/registry.js'
import { getFreddieHome } from '../../../src/home.js'
import { linkSubsystem } from './subsystem-guide.js'

export function registerDevtoolsCommands(C, host) {
    C({ name: 'tools', description: 'List/inspect tools', args: [{ name: 'action', default: 'list' }, { name: 'name' }], action: async (action, name) => {
        if (action === 'get' && name) { console.log(JSON.stringify(host.pi.tools.get(name)?.schema, null, 2)); return }
        for (const t of host.pi.tools.list()) console.log(`${(t.toolset || 'core').padEnd(10)} ${t.name}\t${(t.schema?.description || '').slice(0, 60)}`)
    } })
    C({ name: 'skills', description: 'List/show skills (filesystem + registered via pi.skills)', args: [{ name: 'action', default: 'list' }, { name: 'name' }], action: (action, name) => {
        const fsSkills = listSkills().map(s => ({ name: s.name, description: s.description || '', source: 'fs', body: s.body, file: s.file }))
        const piSkills = host.pi.skills.list().map(s => ({ name: s.name, description: s.description || '', source: s.source || 'pi', body: s.content || s.body || '', file: s.file }))
        const seen = new Set(); const all = []
        for (const s of [...piSkills, ...fsSkills]) { if (seen.has(s.name)) continue; seen.add(s.name); all.push(s) }
        if (action === 'show' && name) { const s = all.find(x => x.name === name); if (!s) { console.error('skill not found:', name); process.exit(1) } console.log(s.body); return }
        for (const s of all) console.log(`${(s.source || 'fs').padEnd(8)} ${s.name}\t${s.description.slice(0, 80)}`)
    } })
    C({ name: 'search', description: 'FTS search across messages', args: [{ name: 'query', required: true }], action: async (q) => {
        const { search } = await import('../../../src/sessions.js')
        for (const r of await search(q)) console.log(`${r.session_id}\t${(r.content || '').slice(0, 100)}`)
    } })
    C({ name: 'help-all', description: 'Print all slash commands', action: () => {
        for (const [cat, cmds] of Object.entries(COMMANDS_BY_CATEGORY)) {
            console.log(`\n# ${cat}`)
            for (const c of cmds) console.log(`  /${c.name}${c.args_hint ? ' ' + c.args_hint : ''}\t${c.description}`)
        }
    } })

    // --- Contributor onboarding: `freddie contribute` ----------------------
    C({ name: 'contribute', description: 'Find a good-first-issue, print a PRD-row template, link the relevant AGENTS.md subsystem row', action: async () => {
        const { execFileSync } = await import('node:child_process')
        const fs = await import('node:fs')
        const path = await import('node:path')

        let owner = null, repo = null
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
            const m = /github\.com[:/]([^/]+)\/([^/.]+?)(\.git)?$/.exec(pkg.repository?.url || pkg.repository || '')
            if (m) { owner = m[1]; repo = m[2] }
        } catch {}
        if (!owner || !repo) {
            try {
                const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim()
                const m = /github\.com[:/]([^/]+)\/([^/.]+?)(\.git)?$/.exec(remote)
                if (m) { owner = m[1]; repo = m[2] }
            } catch {}
        }
        if (!owner || !repo) { console.error('could not determine repo owner/name from package.json or git remote'); process.exitCode = 1; return }

        console.log(`# good first issues — ${owner}/${repo}\n`)
        let issues = []
        try {
            const raw = execFileSync('gh', ['issue', 'list', '--repo', `${owner}/${repo}`, '--label', 'good first issue', '--state', 'open', '--json', 'number,title,url,body', '--limit', '10'], { encoding: 'utf8' })
            issues = JSON.parse(raw)
        } catch (e) {
            console.log('(gh CLI unavailable or no access — falling back to the issues URL)')
            console.log(`  https://github.com/${owner}/${repo}/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22\n`)
        }

        if (issues.length) {
            for (const it of issues) {
                console.log(`#${it.number}  ${it.title}`)
                console.log(`  ${it.url}`)
                const loc = linkSubsystem(`${it.title} ${it.body || ''}`)
                if (loc) console.log(`  AGENTS.md subsystem: ${loc}`)
                console.log(`\n  --- PRD-row template (paste into .gm/prd.yml via the gm skill's prd-add verb) ---`)
                console.log(`  id: issue-${it.number}-${it.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/-+$/, '')}`)
                console.log(`  subject: ${it.title}`)
                console.log(`  status: pending`)
                console.log(`  description: 'Fixes ${owner}/${repo}#${it.number} — ${it.url}'\n`)
            }
        }

        console.log('# verification: manual testing only')
        console.log('  smoke-test via: freddie exec --prompt "hello"')
        console.log('  or boot the dashboard: freddie dashboard')
    } })

    // --- Kai-zen metrics: `freddie kai-zen report [--feedback]` --------------
    C({ name: 'kai-zen', description: 'Metrics and improvement velocity report', args: [{ name: 'action', default: 'report' }], options: [{ flag: '--feedback', description: 'Include feedback vote data' }], action: async (action, opts) => {
        if (action !== 'report') { console.error('usage: freddie kai-zen report [--feedback]'); process.exit(1); return }
        const fs = await import('node:fs')
        const path = await import('node:path')
        const home = getFreddieHome()

        // Read telemetry.jsonl and aggregate
        const telemetryFile = path.join(home, 'telemetry.jsonl')
        let events = []
        if (fs.existsSync(telemetryFile)) {
            try {
                const raw = fs.readFileSync(telemetryFile, 'utf8')
                events = raw.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
            } catch { events = [] }
        }

        const byType = {}
        const bySession = {}
        let totalTurns = 0, totalToolCalls = 0, totalCompactions = 0, totalErrors = 0
        for (const e of events) {
            byType[e.event] = (byType[e.event] || 0) + 1
            if (e.session_id) {
                if (!bySession[e.session_id]) bySession[e.session_id] = { turns: 0, tool_calls: 0, compactions: 0, errors: 0 }
                const s = bySession[e.session_id]
                if (e.event === 'turn_started') s.turns++
                if (e.event === 'tool_call') s.tool_calls++
                if (e.event === 'compaction_finished') s.compactions++
                if (e.event === 'api_error' || e.event === 'compaction_failed') s.errors++
            }
            if (e.event === 'turn_started') totalTurns++
            if (e.event === 'tool_call') totalToolCalls++
            if (e.event === 'compaction_finished') totalCompactions++
            if (e.event === 'api_error' || e.event === 'compaction_failed') totalErrors++
        }

        // Feedback (--feedback flag): read from feedback/ directory
        let topFeedback = []
        if (opts.feedback) {
            try {
                const feedbackDir = path.join(home, 'feedback')
                if (fs.existsSync(feedbackDir)) {
                    const files = fs.readdirSync(feedbackDir).filter(f => f.endsWith('.jsonl') || f.endsWith('.json'))
                    const items = []
                    for (const f of files) {
                        try {
                            const raw = fs.readFileSync(path.join(feedbackDir, f), 'utf8')
                            const parsed = raw.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
                            items.push(...parsed)
                        } catch { /* skip unreadable files */ }
                    }
                    items.sort((a, b) => (b.votes || 0) - (a.votes || 0))
                    topFeedback = items.slice(0, 10).map(i => ({ id: i.id, text: i.text?.slice(0, 100), votes: i.votes || 0, ts: i.ts }))
                }
            } catch { topFeedback = [] }
        }

        const report = {
            ts: new Date().toISOString(),
            kind: 'kai-zen-report',
            total_events: events.length,
            total_turns: totalTurns,
            total_tool_calls: totalToolCalls,
            total_compactions: totalCompactions,
            total_errors: totalErrors,
            events_by_type: byType,
            sessions: Object.keys(bySession).length,
            per_session: Object.fromEntries(Object.entries(bySession).map(([id, s]) => [id.slice(0, 8), s])),
            top_feedback: topFeedback,
        }

        // Write to kai-zen-history.jsonl
        const historyFile = path.join(home, 'kai-zen-history.jsonl')
        fs.mkdirSync(path.dirname(historyFile), { recursive: true })
        fs.appendFileSync(historyFile, JSON.stringify(report) + '\n')

        console.log('kai-zen report:')
        console.log(`  total events:     ${report.total_events}`)
        console.log(`  total turns:      ${report.total_turns}`)
        console.log(`  total tool calls: ${report.total_tool_calls}`)
        console.log(`  total compactions:${report.total_compactions}`)
        console.log(`  total errors:     ${report.total_errors}`)
        console.log(`  sessions:         ${report.sessions}`)
        if (Object.keys(report.events_by_type).length) {
            console.log('  events by type:')
            for (const [type, count] of Object.entries(report.events_by_type)) {
                console.log(`    ${type.padEnd(22)} ${count}`)
            }
        }
        if (opts.feedback) {
            console.log(`  top feedback: ${report.top_feedback.length} items`)
            for (const item of report.top_feedback) {
                console.log(`    [${item.votes}] ${item.text || item.id}`)
            }
        }
        console.log(`\nwritten: ${historyFile}`)
    } })
}
