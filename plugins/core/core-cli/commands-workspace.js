import { listProjects, getActiveProject, createProject, deleteProject, setActiveProject } from '../../../src/projects.js'
import { listSessions, getSession, getMessages, deleteSession } from '../../../src/sessions.js'
import { displayFreddieHome, getFreddieHome } from '../../../src/home.js'
import { listAuthProviders, hasUsableSecret } from '../../../src/auth.js'

export function registerWorkspaceCommands(C) {
    C({ name: 'project', description: 'Manage workspace projects (list|create <name> <path>|use <name>|rm <name>|current)', args: [{ name: 'action', default: 'list' }, { name: 'name' }, { name: 'projectPath' }], action: async (action, name, projectPath) => {
        if (action === 'list') {
            const active = getActiveProject()
            for (const p of listProjects()) console.log(`${p.name === active.name ? '[*]' : '[ ]'} ${p.name.padEnd(16)} ${p.path}\t${(p.created_at || '').slice(0, 10)}`)
            return
        }
        if (action === 'current') { const a = getActiveProject(); console.log(`${a.name}\t${a.path}`); return }
        if (action === 'create') {
            if (!name || !projectPath) { console.error('usage: freddie project create <name> <absolute-path>'); process.exit(1) }
            try { const p = createProject({ name, projectPath }); console.log(`created project ${p.name} -> ${p.path}`) }
            catch (e) { console.error('error:', e.message); process.exit(1) }
            return
        }
        if (action === 'use') {
            if (!name) { console.error('usage: freddie project use <name>'); process.exit(1) }
            try { const p = setActiveProject(name); console.log(`active project: ${p.name} (${p.path})`) }
            catch (e) { console.error('error:', e.message); process.exit(1) }
            return
        }
        if (action === 'rm') {
            if (!name) { console.error('usage: freddie project rm <name>'); process.exit(1) }
            try { deleteProject(name); console.log(`removed project ${name}`) }
            catch (e) { console.error('error:', e.message); process.exit(1) }
            return
        }
        console.error('usage: freddie project [list|create <name> <path>|use <name>|rm <name>|current]'); process.exit(1)
    } })

    // --- Conversation management: `freddie session list|show|rm` -----------
    C({ name: 'session', description: 'Manage conversations (list|show <id>|rm <id>|wire <id>|fork <id> [at]|undo <id>)', args: [{ name: 'action', default: 'list' }, { name: 'id' }, { name: 'a2' }], action: async (action, id, a2) => {
        if (action === 'list') {
            const rows = await listSessions()
            if (!rows.length) { console.log('(no conversations yet — run `freddie run`)'); return }
            const { getTurn } = await import('../../../src/agent/live-turns.js')
            for (const s of rows) console.log(`${s.id.slice(0, 8)}\t${new Date(s.updated_at).toISOString().slice(0, 16).replace('T', ' ')}\t${s.title || '(untitled)'}${getTurn(s.id)?.pendingApproval ? '\t[needs input]' : ''}`)
            return
        }
        if (action === 'show') {
            if (!id) { console.error('usage: freddie session show <id>'); process.exit(1) }
            const rows = await listSessions(500)
            const target = rows.find(s => s.id === id || s.id.startsWith(id))
            if (!target) { console.error('no session matching:', id); process.exit(1) }
            const s = await getSession(target.id)
            console.log(`# ${s.title || '(untitled)'}  [${s.id.slice(0, 8)}]  ${s.model || ''}  ${new Date(s.created_at).toISOString().slice(0, 16).replace('T', ' ')}`)
            for (const m of await getMessages(target.id)) console.log(`\n${m.role}: ${m.content || (m.tool_calls ? '[tool call]' : '')}`)
            return
        }
        if (action === 'rm') {
            if (!id) { console.error('usage: freddie session rm <id>'); process.exit(1) }
            const rows = await listSessions(500)
            const target = rows.find(s => s.id === id || s.id.startsWith(id))
            if (!target) { console.error('no session matching:', id); process.exit(1) }
            await deleteSession(target.id); console.log(`removed session ${target.id.slice(0, 8)}`)
            return
        }
        // kimi vis-style trace viewer over the wire log. Resolves by wire-log
        // FILENAME prefix, not sessions.db (gui-agent workspace sessions only
        // exist as wire logs). assistant.delta lines collapse into the settled
        // message.append; --raw dumps the untouched envelopes.
        if (action === 'wire') {
            if (!id) { console.error('usage: freddie session wire <id> [--raw]'); process.exit(1) }
            const { readWireLog, wireLogDir } = await import('../../../src/agent/events.js')
            const fs = await import('node:fs')
            let sid = id
            try {
                const files = fs.readdirSync(wireLogDir()).filter(f => f.endsWith('.jsonl'))
                const match = files.find(f => f === id + '.jsonl') || files.find(f => f.startsWith(id))
                if (match) sid = match.slice(0, -'.jsonl'.length)
            } catch { /* swallow: missing wire dir just means no logs below */ }
            const events = readWireLog(sid)
            if (!events.length) { console.error('no wire log for session:', id); process.exit(1) }
            if (process.argv.includes('--raw')) { for (const e of events) console.log(JSON.stringify(e)); return }
            for (const e of events) {
                if (e.event === 'assistant.delta') continue
                const t = (e.ts || '').slice(11, 19)
                const d = e.data || {}
                let line = `${t}  ${e.event.padEnd(18)}`
                if (e.event === 'message.append') line += ` ${d.role}: ${String(d.content || (d.tool_calls?.length ? '[tool call]' : '')).slice(0, 100).replace(/\n/g, ' ')}`
                else if (e.event === 'tool.start') line += ` ${d.name} ${JSON.stringify(d.args || {}).slice(0, 80)}`
                else if (e.event === 'tool.end') line += ` ${d.name}${d.denied ? ' (denied)' : ''}`
                else if (e.event.startsWith('approval.')) line += ` ${d.name || ''} ${d.approved != null ? (d.approved ? 'approved' : 'rejected') : ''}`
                else if (e.event === 'steer.append') line += ` ${d.text}`
                console.log(line)
            }
            return
        }
        // kimi /fork: copy the wire transcript (optionally a prefix) into a
        // new session id — wire log + sessions.db stay consistent.
        if (action === 'fork') {
            if (!id) { console.error('usage: freddie session fork <id> [atEventIndex]'); process.exit(1) }
            const { forkWireLog, transcriptFromWire, wireLogDir } = await import('../../../src/agent/events.js')
            const fs = await import('node:fs')
            let sid = id
            try {
                const files = fs.readdirSync(wireLogDir()).filter(f => f.endsWith('.jsonl'))
                const match = files.find(f => f === id + '.jsonl') || files.find(f => f.startsWith(id))
                if (match) sid = match.slice(0, -'.jsonl'.length)
            } catch { /* swallow: missing wire dir just means no logs below */ }
            const atIdx = a2 != null && a2 !== '' ? Number(a2) : null
            const newSid = forkWireLog(sid, { atIndex: Number.isFinite(atIdx) ? atIdx : null })
            if (!newSid) { console.error('no wire log to fork for session:', id); process.exit(1) }
            const { createSession, getSession, appendMessage } = await import('../../../src/sessions.js')
            const source = await getSession(sid).catch(() => null)
            if (!(await getSession(newSid).catch(() => null))) {
                await createSession({ id: newSid, platform: source?.platform || 'web', title: 'fork of ' + (source?.title || sid.slice(0, 8)), cwd: source?.cwd || null, model: source?.model || null })
            }
            for (const m of transcriptFromWire(newSid)) {
                await appendMessage(newSid, { role: m.role, content: m.content, toolCalls: m.tool_calls || null, toolCallId: m.tool_call_id || null })
            }
            console.log(`forked ${sid.slice(0, 8)} -> ${newSid}${Number.isFinite(atIdx) ? ' (at event ' + atIdx + ')' : ''}`)
            return
        }
        // kimi /undo: drop the LAST turn — truncate the wire log at the last
        // session.start, then rebuild the DB transcript to match.
        if (action === 'undo') {
            if (!id) { console.error('usage: freddie session undo <id>'); process.exit(1) }
            const { lastTurnStartIndex, truncateWireLog, transcriptFromWire, wireLogDir } = await import('../../../src/agent/events.js')
            const fs = await import('node:fs')
            let sid = id
            try {
                const files = fs.readdirSync(wireLogDir()).filter(f => f.endsWith('.jsonl'))
                const match = files.find(f => f === id + '.jsonl') || files.find(f => f.startsWith(id))
                if (match) sid = match.slice(0, -'.jsonl'.length)
            } catch { /* swallow: missing wire dir just means no logs below */ }
            const cut = lastTurnStartIndex(sid)
            const kept = truncateWireLog(sid, cut)
            if (kept == null) { console.error('no wire log for session:', id); process.exit(1) }
            const { purgeSessionMessages, appendMessage } = await import('../../../src/sessions.js')
            await purgeSessionMessages(sid)
            for (const m of transcriptFromWire(sid)) {
                await appendMessage(sid, { role: m.role, content: m.content, toolCalls: m.tool_calls || null, toolCallId: m.tool_call_id || null })
            }
            console.log(`undid last turn of ${sid.slice(0, 8)} (kept ${kept} events)`)
            return
        }
        console.error('usage: freddie session [list|show <id>|rm <id>|wire <id> [--raw]|fork <id> [at]|undo <id>]'); process.exit(1)
    } })

    // --- Onboarding: `freddie doctor` one-glance health --------------------
    C({ name: 'doctor', description: 'Health check: keys, active project, conversations, environment', action: async () => {
        const { runDoctor } = await import('../../../src/cli/doctor.js')
        console.log('# environment')
        for (const c of await runDoctor()) console.log(`  ${c.ok ? '[ok]' : '[--]'} ${c.name.padEnd(16)} ${c.value || c.fix || ''}`)
        console.log('\n# provider keys')
        let anyKey = false
        for (const p of listAuthProviders()) { const ok = await hasUsableSecret(p); if (ok) anyKey = true; if (ok) console.log(`  [ok] ${p}`) }
        if (!anyKey) console.log('  [--] no provider keys set — run `freddie auth set <provider>` or `freddie setup`')
        const proj = getActiveProject()
        console.log(`\n# workspace\n  active project: ${proj.name}\n  home: ${displayFreddieHome()}  (${getFreddieHome()})`)
        const sessions = await listSessions(500)
        console.log(`\n# conversations\n  ${sessions.length} saved (latest: ${sessions[0] ? (sessions[0].title || sessions[0].id.slice(0, 8)) : 'none'})`)
    } })

    // --- Onboarding: `freddie setup` guided first-run ----------------------
    C({ name: 'setup', description: 'Guided first-run: pick provider, store a key, configure defaults', action: async () => {
        const { setupWizard, getSetupStatus } = await import('../../../src/cli/setup.js')
        await setupWizard({})
        const st = getSetupStatus()
        console.log(`\nsetup complete — provider: ${st.provider}, skin: ${st.skin}`)
        console.log('next: `freddie run` to start a conversation, or `freddie doctor` to verify')
    } })
}
