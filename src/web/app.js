import ds, { mount, installStyles, h, components, renderMarkdown, motion } from 'anentrypoint-design'
const { AppShell, Topbar, Crumb, Side, Status, Panel, Row, Btn, Chip, Chat, ChatComposer, ChatMessage, AICat,
    Brand, EmptyState, RowLink, Receipt, Changelog, Hero, ConfirmDialog, Section, Install, Kpi, Table } = components
const kpi = (items) => Kpi({ items })
const table = (headers, rows, opts = {}) => Table({ headers, rows, onRowClick: opts.onRowClick })

await installStyles()

if (!window.__debug) { try { window.__debug = {} } catch { Object.defineProperty(window, '__debug', { value: {}, writable: true, configurable: true }) } }
window.__debug.dashboard = () => ({ booted: true, ts: Date.now(), framework: 'anentrypoint-design+webjsx', route: location.hash || '#/sessions' })
window.__debug.agents = () => ({ registered: true, active: AppState.agents?.active || null, count: AppState.agents?.count || 0 })

const j = async (u, opts) => { try { const r = await fetch(u, opts); if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return await r.json() } catch (e) { return { __error: String(e) } } }

const ROUTES = [
    { path: '#/home',      label: 'Home',          glyph: '⌂' },
    { path: '#/chat',      label: 'Chat',          glyph: '⌨' },
    { path: '#/sessions',  label: 'Sessions',      glyph: '✉' },
    { path: '#/agents',    label: 'Agents',        glyph: '◈' },
    { path: '#/analytics', label: 'Analytics',     glyph: '◉' },
    { path: '#/models',    label: 'Models',        glyph: '◎' },
    { path: '#/logs',      label: 'Logs',          glyph: '☰' },
    { path: '#/cron',      label: 'Cron',          glyph: '◷' },
    { path: '#/skills',    label: 'Skills',        glyph: '◈' },
    { path: '#/config',    label: 'Config',        glyph: '⚙' },
    { path: '#/env',       label: 'Keys',          glyph: '⚿' },
    { path: '#/tools',     label: 'Tools',         glyph: '⚒' },
    { path: '#/batch',     label: 'Batch',         glyph: '⊞' },
    { path: '#/gateway',   label: 'Gateway',       glyph: '⇌' },
]
window.__debug.routes = () => ROUTES.map(r => r.path)

const AppState = {
    hash: location.hash || '#/home',
    body: null,
    ts: new Date().toLocaleTimeString(),
    theme: localStorage.getItem('freddie-theme') || 'dark',
    search: { query: '', results: [] },
    sessionsFilter: '',
    chat: { messages: [], draft: '', streaming: false },
    batch: { results: null, running: false },
    agents: { count: 0, active: null },
}
function applyTheme() { document.documentElement.setAttribute('data-theme', AppState.theme) }
applyTheme()
window.__debug.state = () => AppState

function pre(obj) { return h('pre', {}, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)) }

function timeNow() {
    const d = new Date()
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

function toChatMsg(m, key) {
    const time = m.time || ''
    if (m.role === 'user') {
        return { who: 'you', avatar: 'u', time, receipt: 'delivered', key,
            parts: [{ kind: 'text', text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }] }
    }
    if (m.role === 'tool') {
        const body = typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2)
        return { who: 'them', avatar: '⚒', name: 'tool' + (m.tool_call_id ? ' · ' + String(m.tool_call_id).slice(0, 8) : ''), time, key,
            parts: [{ kind: 'code', lang: 'json', filename: 'tool result', code: body }] }
    }
    const parts = []
    const text = typeof m.content === 'string' ? m.content : ''
    if (text) parts.push({ kind: 'md', text })
    if (Array.isArray(m.tool_calls) && m.tool_calls.length) {
        for (const c of m.tool_calls) {
            parts.push({ kind: 'code', lang: 'json', filename: 'call · ' + (c.name || c.function?.name || '?'),
                code: JSON.stringify(c.arguments || c.function?.arguments || {}, null, 2) })
        }
    }
    if (parts.length === 0) parts.push({ kind: 'text', text: '' })
    return { who: 'them', avatar: '◉', name: 'freddie', time, key, parts }
}

const PAGES = {
    '#/chat': async () => {
        const messages = AppState.chat.messages.map((m, i) => toChatMsg(m, 'm' + i))
        return AICat({
            name: 'freddie',
            status: AppState.chat.streaming ? 'thinking…' : 'online · live runTurn via SSE',
            messages,
            thinking: AppState.chat.streaming,
            composer: ChatComposer({
                value: AppState.chat.draft,
                placeholder: 'Ask freddie — runs through registered tools and the configured LLM…',
                disabled: AppState.chat.streaming,
                onInput: (v) => { AppState.chat.draft = v; rerender() },
                onSend: (text) => { AppState.chat.draft = ''; sendChat(text) },
            }),
        })
    },

    '#/home': async () => {
        const [sessions, tools, skills] = await Promise.all([j('/api/sessions'), j('/api/tools'), j('/api/skills')])
        const sessionCount = Array.isArray(sessions) ? sessions.length : 0
        const toolCount = Array.isArray(tools) ? tools.length : 0
        const skillCount = ((skills.home || []).length + (skills.bundled || []).length)
        return [
            Hero({ title: 'freddie', body: 'Open JS agent harness built on pi-mono, xstate, floosie, and anentrypoint-design.', accent: 'v0.0.1' }),
            kpi([[sessionCount, 'Sessions'], [toolCount, 'Tools'], [skillCount, 'Skills']]),
            Panel({ title: 'Quick start', children: Receipt({ rows: [
                ['Run interactive REPL', 'freddie run'],
                ['Start dashboard', 'freddie dashboard --port 3000'],
                ['List tools', 'freddie tools'],
                ['List skills', 'freddie skills'],
                ['Start gateway', 'freddie gateway --port 4000'],
            ]}) }),
        ]
    },

    '#/sessions': async () => {
        const sessions = await j('/api/sessions')
        const all = sessions.__error ? [] : sessions
        const q = AppState.sessionsFilter.toLowerCase()
        const filtered = q ? all.filter(s => JSON.stringify(s).toLowerCase().includes(q)) : all
        return [
            kpi([[all.length || 0, 'Total sessions'], [filtered.length, 'After filter']]),
            Panel({ title: 'Filter', children: h('div', { class: 'row-form' },
                h('input', { type: 'text', placeholder: 'filter by platform/title/model/id…', value: AppState.sessionsFilter,
                    oninput: (ev) => { AppState.sessionsFilter = ev.target.value; rerender() } })) }),
            Panel({ title: 'Recent sessions (click row → detail)', count: filtered.length,
                children: filtered.length === 0
                    ? EmptyState({ text: 'no sessions yet — start a chat', glyph: '✉' })
                    : h('div', {}, ...filtered.map(s =>
                        RowLink({ key: s.id, href: '#/session/' + s.id,
                            code: s.id?.slice(0, 8), title: s.title || s.platform || 'untitled',
                            sub: s.model || '', meta: new Date(s.updated_at || 0).toLocaleString() }))) }),
        ]
    },

    '#/agents': async () => {
        const agents = await j('/api/agents')
        const count = agents.__error ? 0 : (agents.count || 0)
        const active = agents.active || null
        return [
            kpi([[count || 0, 'Total agents'], [active ? 1 : 0, 'Active']]),
            Panel({ title: 'Agent overview', children: Receipt({ rows: [
                ['Total agent turns', String(agents.turns || 0)],
                ['Active agent', active || '(none)'],
                ['Last activity', agents.last_activity ? new Date(agents.last_activity).toLocaleString() : '—'],
            ]}) }),
        ]
    },

    '#/analytics': async () => {
        const [sessions, tools, debug] = await Promise.all([j('/api/sessions'), j('/api/tools'), j('/api/debug')])
        const all = Array.isArray(sessions) ? sessions : []
        const ts = Array.isArray(tools) ? tools : []
        const byPlatform = all.reduce((acc, s) => { const k = s.platform || 'unknown'; acc[k] = (acc[k] || 0) + 1; return acc }, {})
        const byModel = all.reduce((acc, s) => { const k = s.model || 'unknown'; acc[k] = (acc[k] || 0) + 1; return acc }, {})
        return [
            kpi([
                [all.length || 0, 'Sessions'],
                [ts.length || 0, 'Tools'],
                [Array.isArray(debug) ? debug.length : 0, 'Debug subsystems'],
            ]),
            Panel({ title: 'Sessions by platform', children: Object.keys(byPlatform).length === 0
                ? EmptyState({ text: 'no sessions yet', glyph: '◉' })
                : table(['platform', 'count'], Object.entries(byPlatform).sort((a,b) => b[1]-a[1])) }),
            Panel({ title: 'Sessions by model', children: Object.keys(byModel).length === 0
                ? EmptyState({ text: 'no sessions yet', glyph: '◎' })
                : table(['model', 'count'], Object.entries(byModel).sort((a,b) => b[1]-a[1])) }),
            Panel({ title: 'Tool distribution by toolset', children: table(['toolset', 'count', 'tools'],
                Object.entries(ts.reduce((acc, t) => { acc[t.toolset] = acc[t.toolset] || []; acc[t.toolset].push(t.name); return acc }, {}))
                    .map(([k, v]) => [k, v.length, v.slice(0,4).join(', ') + (v.length > 4 ? '…' : '')])) }),
        ]
    },

    '#/models': async () => {
        const config = await j('/api/config')
        const agent = config.agent || {}
        return [
            kpi([[agent.provider || '—', 'Provider'], [agent.model || '—', 'Model']]),
            Panel({ title: 'Active model config', children: Receipt({ rows: [
                ['provider', agent.provider || '(not set)'],
                ['model', agent.model || '(not set)'],
                ['max_iterations', String(agent.max_iterations || '—')],
                ['max_tokens', String(agent.max_tokens || '—')],
                ['temperature', String(agent.temperature ?? '—')],
            ]}) }),
            Panel({ title: 'Change model', children: h('form', { class: 'row-form', onsubmit: async (ev) => {
                ev.preventDefault()
                const f = ev.target.elements
                await j('/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'agent.model', value: f.model.value }) })
                await j('/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'agent.provider', value: f.provider.value }) })
                rerender()
            } },
                h('input', { name: 'provider', placeholder: 'provider (anthropic / openai / groq)', value: agent.provider || '' }),
                h('input', { name: 'model', placeholder: 'model id (e.g. claude-opus-4-5)', value: agent.model || '' }),
                h('button', { type: 'submit', class: 'primary' }, 'Update')) }),
        ]
    },

    '#/logs': async () => {
        const subs = await j('/api/logs')
        const list = Array.isArray(subs) ? subs : []
        const first = list[0]
        const recent = first ? await j(`/api/logs/${first}?max=50`) : []
        return [
            kpi([[list.length, 'Log subsystems']]),
            Panel({ title: 'Subsystems', children: list.length === 0
                ? EmptyState({ text: 'no logs yet — run freddie and observe', glyph: '☰' })
                : h('div', {}, ...list.map(s => Row({ key: s, code: '☰', title: s, meta: '' }))) }),
            first
                ? Panel({ title: `Latest entries · ${first}`, children: pre(recent) })
                : null,
        ].filter(Boolean)
    },

    '#/cron': async () => {
        const jobs = await j('/api/cron')
        const list = Array.isArray(jobs) ? jobs : []
        return [
            kpi([[list.length, 'Cron jobs']]),
            Panel({ title: 'Add job', children: h('form', { class: 'row-form', onsubmit: async (ev) => {
                ev.preventDefault()
                const f = ev.target.elements
                await j('/api/cron', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cron: f.cron.value, prompt: f.prompt.value }) })
                f.cron.value = ''; f.prompt.value = ''; rerender()
            } },
                h('input', { name: 'cron', placeholder: 'cron expr (* * * * *)' }),
                h('input', { name: 'prompt', placeholder: 'prompt' }),
                h('button', { type: 'submit', class: 'primary' }, 'Create')) }),
            Panel({ title: 'Scheduled jobs', count: list.length, children: list.length === 0
                ? EmptyState({ text: 'no cron jobs — add one above', glyph: '◷' })
                : h('table', {},
                    h('thead', {}, h('tr', {}, ...['id', 'cron', 'prompt', 'enabled', ''].map(c => h('th', {}, c)))),
                    h('tbody', {}, ...list.map(job => h('tr', {},
                        h('td', {}, String(job.id)),
                        h('td', {}, job.cron),
                        h('td', {}, (job.prompt || '').slice(0, 60)),
                        h('td', {}, job.enabled ? 'yes' : 'no'),
                        h('td', {}, h('button', {
                            class: 'danger',
                            onclick: async () => { await fetch('/api/cron/' + job.id, { method: 'DELETE' }); rerender() }
                        }, 'delete')))))) }),
        ]
    },

    '#/skills': async () => {
        const data = await j('/api/skills')
        const home = data.home || []
        const bundled = data.bundled || []
        return [
            kpi([[home.length, 'User skills'], [bundled.length, 'Bundled skills']]),
            Panel({ title: 'User skills (~/.freddie/skills)', count: home.length,
                children: home.length === 0
                    ? EmptyState({ text: 'drop SKILL.md files in ~/.freddie/skills/ to add', glyph: '◈' })
                    : h('div', {}, ...home.map(s => Row({ key: s.name, code: '◈', title: s.name, sub: s.description || '', meta: '' }))) }),
            Panel({ title: 'Bundled skills', count: bundled.length,
                children: h('div', {}, ...bundled.map(s => Row({ key: s.name, code: '◈', title: s.name, sub: s.description || '', meta: '' }))) }),
        ]
    },

    '#/config': async () => {
        const config = await j('/api/config')
        const profiles = await j('/api/profiles')
        const commands = await j('/api/commands')
        return [
            kpi([
                [(profiles || []).length, 'Profiles'],
                [(commands || []).length, 'Commands'],
                [config._config_version || 0, 'Config version'],
            ]),
            Panel({ title: 'Set config value', children: h('form', { class: 'row-form', onsubmit: async (ev) => {
                ev.preventDefault()
                const f = ev.target.elements
                await j('/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: f.key.value, value: f.value.value }) })
                f.value.value = ''; rerender()
            } },
                h('input', { name: 'key', placeholder: 'dotted.key (e.g. display.skin)' }),
                h('input', { name: 'value', placeholder: 'value' }),
                h('button', { type: 'submit', class: 'primary' }, 'Save')) }),
            Panel({ title: 'Profiles', count: (profiles || []).length,
                children: (profiles || []).length === 0
                    ? EmptyState({ text: 'no profiles — using HOME', glyph: '◎' })
                    : h('div', {}, ...(profiles || []).map(p => Row({ key: p, code: '◎', title: p, meta: '' }))) }),
            Panel({ title: 'Slash commands', count: (commands || []).length,
                children: table(['name', 'category', 'description'], (commands || []).map(c => [c.name, c.category || '', c.description || ''])) }),
            Panel({ title: 'Active config', children: pre(config) }),
        ]
    },

    '#/env': async () => {
        const keys = await j('/api/env')
        const list = Array.isArray(keys) ? keys : []
        const set = list.filter(k => k.set).length
        return [
            kpi([[set, 'Keys set'], [list.length - set, 'Keys missing'], [list.length, 'Total known']]),
            Panel({ title: 'Environment variables',
                right: h('span', {}, Chip({ tone: 'ok', children: set + ' set' }), ' ', Chip({ tone: 'miss', children: (list.length - set) + ' missing' })),
                children: h('div', { style: 'padding:8px 4px;display:flex;flex-wrap:wrap;gap:6px' },
                    ...list.map(k => Chip({ tone: k.set ? 'ok' : 'miss', children: k.key + (k.set ? ' ✓' : ' ·') }))) }),
        ]
    },

    '#/tools': async () => {
        const tools = await j('/api/tools')
        const list = Array.isArray(tools) ? tools : []
        const byToolset = list.reduce((acc, t) => { (acc[t.toolset] = acc[t.toolset] || []).push(t); return acc }, {})
        return [
            kpi([[list.length, 'Total tools'], [Object.keys(byToolset).length, 'Toolsets']]),
            ...Object.entries(byToolset).map(([ts, ts_tools]) =>
                Panel({ title: 'Toolset · ' + ts, count: ts_tools.length,
                    children: h('div', {}, ...ts_tools.map(t =>
                        Row({ key: t.name, code: '⚒', title: t.name, sub: (t.schema?.description || '').slice(0, 80), meta: '' }))) }))
        ]
    },

    '#/batch': async () => {
        const results = AppState.batch.results
        const running = AppState.batch.running
        return [
            Section({ title: '// batch runner', children: [
                Panel({ title: 'Run prompts', children: h('div', {},
                    h('p', { style: 'margin-bottom:12px;opacity:0.7' }, 'Submit multiple prompts in parallel. Results stream back as JSONL. Each prompt runs a full agent turn.'),
                    h('form', { class: 'row-form', style: 'flex-direction:column;gap:8px', onsubmit: async (ev) => {
                        ev.preventDefault()
                        const f = ev.target.elements
                        const prompts = f.prompts.value.split('\n').map(l => l.trim()).filter(Boolean)
                        if (!prompts.length) return
                        AppState.batch.running = true; AppState.batch.results = null; rerender()
                        const res = await j('/api/batch', { method: 'POST', headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ prompts, concurrency: Number(f.concurrency.value) || 4 }) })
                        AppState.batch.results = res; AppState.batch.running = false; rerender()
                    } },
                        h('textarea', { name: 'prompts', rows: 5, placeholder: 'One prompt per line…', style: 'width:100%;font-family:monospace;resize:vertical' }),
                        h('div', { style: 'display:flex;gap:8px;align-items:center' },
                            h('label', { style: 'font-size:12px;opacity:0.6' }, 'concurrency'),
                            h('input', { name: 'concurrency', type: 'number', value: '4', style: 'width:60px' }),
                            h('button', { type: 'submit', class: 'primary', disabled: running }, running ? 'running…' : 'Run batch')))) }),
                running ? Panel({ title: 'Running…', children: EmptyState({ text: 'batch in progress', glyph: '⊞' }) }) : null,
                results ? Panel({ title: results.__error ? 'Error' : 'Results · ' + (results.results?.length || 0),
                    children: results.__error
                        ? h('p', { style: 'color:var(--error,red)' }, results.__error)
                        : h('div', {}, ...(results.results || []).map((r, i) =>
                            Row({ key: i, code: String(i+1), title: (r.prompt || '').slice(0, 60), sub: (r.output || r.error || '').slice(0, 100), meta: r.error ? 'error' : 'ok' }))) }) : null,
                Panel({ title: 'CLI usage', children: Receipt({ rows: [
                    ['run batch file', 'freddie batch prompts.txt'],
                    ['set concurrency', 'freddie batch prompts.txt --concurrency 8'],
                    ['JSONL output', 'freddie batch prompts.txt > results.jsonl'],
                ]}) }),
            ].filter(Boolean) }),
        ]
    },

    '#/gateway': async () => {
        const data = await j('/api/gateway')
        const platforms = Array.isArray(data?.platforms) ? data.platforms : []
        const active = platforms.filter(p => p.enabled)
        return [
            kpi([[platforms.length, 'Platforms'], [active.length, 'Active']]),
            Panel({ title: 'Platforms', right: active.length > 0 ? Chip({ tone: 'ok', children: active.length + ' active' }) : Chip({ tone: 'miss', children: 'none active' }),
                children: h('div', {}, ...platforms.map(p =>
                    Row({ key: p.name, code: p.enabled ? '●' : '○', title: p.name, sub: p.note || '', meta: p.enabled ? 'enabled' : '' }))) }),
            Panel({ title: 'Start gateway', children: Receipt({ rows: [
                ['webhook + api_server', 'freddie gateway --port 3000'],
                ['specific platform', 'TELEGRAM_BOT_TOKEN=xxx freddie gateway'],
                ['all platforms', 'set env vars per platform, then freddie gateway'],
            ]}) }),
        ]
    },

}

async function pageSessionDetail(id) {
    const messages = await j('/api/sessions/' + id + '/messages')
    const list = Array.isArray(messages) ? messages : []
    return [
        Panel({ title: 'Session ' + id.slice(0, 8), children: kpi([[list.length, 'messages']]) }),
        list.length === 0
            ? Panel({ title: 'Messages', children: EmptyState({ text: 'no messages in this session', glyph: '✉' }) })
            : Chat({ title: 'session ' + id.slice(0, 8), sub: 'replay', messages: list.map((m, i) => toChatMsg(m, 's' + i)) }),
        Panel({ title: 'Back', children: h('a', { href: '#/sessions' }, '← all sessions') }),
    ]
}

async function sendChat(prompt) {
    if (!prompt || !prompt.trim() || AppState.chat.streaming) return
    AppState.chat.messages.push({ role: 'user', content: prompt, time: timeNow() })
    AppState.chat.streaming = true
    rerender()
    try {
        const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) })
        const reader = r.body.getReader(), dec = new TextDecoder()
        let buf = ''
        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buf += dec.decode(value, { stream: true })
            let idx
            while ((idx = buf.indexOf('\n\n')) >= 0) {
                const block = buf.slice(0, idx); buf = buf.slice(idx + 2)
                const ev = (block.match(/^event: (.+)$/m) || [, ''])[1]
                const data = (block.match(/^data: (.+)$/m) || [, '{}'])[1]
                let parsed; try { parsed = JSON.parse(data) } catch { parsed = { raw: data } }
                if (ev === 'message') {
                    if (parsed.role !== 'user') AppState.chat.messages.push({ ...parsed, time: timeNow() })
                } else if (ev === 'error') {
                    AppState.chat.messages.push({ role: 'assistant', content: '**[error]** ' + parsed.error, time: timeNow() })
                }
            }
        }
    } catch (e) {
        AppState.chat.messages.push({ role: 'assistant', content: '**[network error]** ' + e.message, time: timeNow() })
    }
    AppState.chat.streaming = false
    rerender()
}

async function doSearch(q) {
    AppState.search.query = q
    if (!q.trim()) { AppState.search.results = []; rerender(); return }
    const r = await j('/api/search?q=' + encodeURIComponent(q))
    AppState.search.results = Array.isArray(r) ? r : []
    rerender()
}

function buildSide(state) {
    const sections = [{
        group: 'NAVIGATION',
        items: ROUTES.map(r => ({
            glyph: r.glyph,
            label: r.label,
            href: r.path,
            active: !state.hash.startsWith('#/session/') && r.path === state.hash,
            onClick: (ev) => { ev.preventDefault(); location.hash = r.path },
        })),
    }]
    return Side({ sections })
}

function render(state) {
    let route = ROUTES.find(r => r.path === state.hash)
    const isSessionDetail = state.hash.startsWith('#/session/')
    if (!route && !isSessionDetail) route = ROUTES[0]
    const themeLabel = state.theme === 'dark' ? '☀ light' : '☾ dark'
    const themeBtn = h('button', {
        class: 'ghost',
        onclick: () => {
            AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark'
            localStorage.setItem('freddie-theme', AppState.theme)
            applyTheme(); rerender()
        },
        style: 'font-size:12px;padding:4px 12px',
    }, themeLabel)
    const searchInput = h('input', {
        type: 'search',
        placeholder: 'search messages…',
        value: state.search.query,
        onkeydown: (ev) => { if (ev.key === 'Enter') doSearch(ev.target.value) },
        style: 'min-width:240px',
    })
    const topbarWithControls = h('header', { class: 'app-topbar' },
        Brand({ name: 'freddie', leaf: 'dashboard' }),
        h('div', { style: 'flex:1' }),
        searchInput,
        themeBtn,
    )
    const crumbRight = state.search.results.length > 0
        ? h('span', { class: 'meta' }, state.search.results.length + ' hits')
        : null
    const crumb = Crumb({ trail: ['freddie'], leaf: isSessionDetail ? state.hash.replace('#/', '') : route.path.replace('#/', ''), right: crumbRight })
    const searchResults = state.search.results.length > 0
        ? Panel({ title: `search results · ${state.search.results.length}`, children: state.search.results.slice(0, 8).map((r, i) =>
            Row({ key: i, code: (r.session_id || '?').slice(0, 8), title: (r.content || '').slice(0, 80),
                meta: 'open', onClick: () => { location.hash = '#/session/' + r.session_id } })) })
        : null
    const main = [searchResults, state.body || EmptyState({ text: 'loading…' })].filter(Boolean)
    const status = Status({
        left: ['ds-247420 · webjsx · ' + ROUTES.length + ' routes', 'theme=' + state.theme],
        right: [state.ts],
    })
    return AppShell({ topbar: topbarWithControls, crumb, side: buildSide(state), main, status })
}

let _mount

async function go() {
    AppState.hash = location.hash || '#/home'
    AppState.ts = new Date().toLocaleTimeString()
    AppState.body = EmptyState({ text: 'loading…', glyph: '◌' })
    if (_mount) _mount()
    let body
    if (AppState.hash.startsWith('#/session/')) {
        body = await pageSessionDetail(AppState.hash.slice('#/session/'.length))
    } else {
        const page = PAGES[AppState.hash] || PAGES['#/home']
        body = await page()
    }
    AppState.body = body
    AppState.ts = new Date().toLocaleTimeString()
    if (_mount) _mount()
    window.__debug.lastRoute = AppState.hash
    requestAnimationFrame(() => motion.animateSelector('.app-main', 'fadeIn', { duration: 'var(--motion-base)' }))
}

function rerender() {
    AppState.ts = new Date().toLocaleTimeString()
    if (AppState.hash === '#/chat') {
        Promise.resolve(PAGES['#/chat']()).then(b => { AppState.body = b; if (_mount) _mount() })
        return
    }
    if (_mount) _mount()
}

window.addEventListener('hashchange', go)
_mount = mount(document.getElementById('app'), () => render(AppState))
go()

window.__debug.go = go
window.__debug.sendChat = sendChat
window.__debug.doSearch = doSearch
window.__debug.chat = () => ({ messages: AppState.chat.messages.length, streaming: AppState.chat.streaming, draft: AppState.chat.draft })
