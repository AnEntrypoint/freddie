import { h } from 'anentrypoint-design';

export const j = async (u, opts) => { const r = await fetch(u, opts); if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.json(); };
export const post = (u, b) => j(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

export function reg(arr, keyFn = x => x.name) {
    const m = new Map();
    for (const it of arr || []) m.set(keyFn(it), it);
    return { get: k => m.get(k), has: k => m.has(k), list: () => [...m.values()], values: () => m.values(), get size() { return m.size; } };
}

export async function fetchHost() {
    const [tools, skillsR, cron, projR, env, gateway, health, commands] = await Promise.all([
        j('/api/tools/detail').catch(() => []),
        j('/api/skills').catch(() => ({ home: [], bundled: [] })),
        j('/api/cron').catch(() => []),
        j('/api/projects').catch(() => ({ active: null, projects: [] })),
        j('/api/env').catch(() => []),
        j('/api/gateway').catch(() => ({ platforms: [] })),
        j('/api/health').catch(() => ({ ok: false })),
        j('/api/commands').catch(() => []),
    ]);
    const skillList = [...(skillsR.home || []), ...(skillsR.bundled || [])];
    const projList = projR.projects || [];
    return {
        kind: 'freddie-web', version: 'web',
        pi: {
            tools: reg(tools),
            skills: reg(skillList, s => s.name || s.id),
            cli: reg(commands),
            projects: {
                list: () => projList,
                active: () => projR.active,
                create: ({ name, path }) => post('/api/projects', { name, path }).then(() => location.reload()),
                remove: name => fetch('/api/projects/' + encodeURIComponent(name), { method: 'DELETE' }).then(() => location.reload()),
                setActive: name => post('/api/projects/active', { name }).then(() => location.reload()),
            },
            sessions: {
                list: () => j('/api/sessions').catch(() => []),
                getMessages: id => j('/api/sessions/' + encodeURIComponent(id) + '/messages').catch(() => []),
                search: q => j('/api/search?q=' + encodeURIComponent(q)).catch(() => []),
            },
            cron: {
                list: () => Promise.resolve(cron),
                create: job => post('/api/cron', job),
                delete: id => fetch('/api/cron/' + id, { method: 'DELETE' }),
            },
            env: { list: () => env, isSet: k => (env.find(e => e.key === k) || {}).set || false },
            gateway: { platforms: () => gateway.platforms || [] },
            agents: () => j('/api/agents').catch(() => ({ count: 0, turns: 0, active: null })),
            health: () => health,
            config: {
                load: () => j('/api/config').catch(() => ({})),
                saveValue: (path, value) => post('/api/config', { path, value }),
            },
            chat: { send: text => post('/api/chat', { text }) },
            batch: { run: (prompts, conc) => post('/api/batch', { prompts, concurrency: conc }) },
            hooks: {},
        },
    };
}

export const ROUTES = [
    { path: 'home',      label: 'home',      glyph: '⌂' },
    { path: 'chat',      label: 'chat',      glyph: '⌨' },
    { path: 'sessions',  label: 'sessions',  glyph: '✉' },
    { path: 'projects',  label: 'projects',  glyph: '◆' },
    { path: 'agents',    label: 'agents',    glyph: '◈' },
    { path: 'analytics', label: 'analytics', glyph: '◉' },
    { path: 'models',    label: 'models',    glyph: '◎' },
    { path: 'cron',      label: 'cron',      glyph: '◷' },
    { path: 'skills',    label: 'skills',    glyph: '◈' },
    { path: 'config',    label: 'config',    glyph: '⚙' },
    { path: 'env',       label: 'keys',      glyph: '⚿' },
    { path: 'tools',     label: 'tools',     glyph: '⚒' },
    { path: 'batch',     label: 'batch',     glyph: '⊞' },
    { path: 'gateway',   label: 'gateway',   glyph: '⇌' },
];

export function pre(obj) {
    return h('pre', { class: 'fd-pre' }, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

export function mkForm({ fields = [], submit = 'submit', onSubmit }) {
    return h('form', { class: 'row-form', onsubmit: ev => { ev.preventDefault(); onSubmit && onSubmit(ev); } },
        ...fields.map(f => f.kind === 'textarea'
            ? h('textarea', { name: f.name, placeholder: f.placeholder || '', rows: f.rows || 4 })
            : h('input', { name: f.name, type: f.type || 'text', placeholder: f.placeholder || '', value: f.value || '', required: f.required ? 'true' : null })),
        h('button', { type: 'submit', class: 'btn-primary' }, submit));
}

export function getRecentPaths() {
    try { return JSON.parse(localStorage.getItem('fd_recent_cwds') || '[]'); } catch { return []; }
}
export function saveRecentPath(p) {
    if (!p) return;
    try {
        const prev = getRecentPaths().filter(x => x !== p);
        localStorage.setItem('fd_recent_cwds', JSON.stringify([p, ...prev].slice(0, 5)));
    } catch {}
}
export function skillLabel(s) {
    const n = s.name || '';
    return n.replace(/^gm:/, '').replace(/^software-development$/, 'software dev').replace(/-/g, ' ');
}

export function renderChatMessages(container, messages) {
    if (!container) return;
    container.innerHTML = '';
    for (const m of messages) {
        if (m.role === 'tool') {
            const det = document.createElement('details');
            det.className = 'fd-tool-call';
            const sum = document.createElement('summary');
            sum.textContent = '⚒ ' + m.name + (m.argsSummary ? ' ' + m.argsSummary : '');
            det.appendChild(sum);
            const body = document.createElement('pre');
            body.className = 'fd-tool-body';
            body.textContent = m.content || '';
            det.appendChild(body);
            container.appendChild(det);
        } else {
            const el = document.createElement('div');
            el.className = 'fd-msg fd-msg-' + (m.role === 'assistant' ? 'assistant' : 'user');
            el.textContent = (m.role === 'assistant' ? '◈ ' : '▷ ') + (m.content || '');
            container.appendChild(el);
        }
    }
    container.scrollTop = container.scrollHeight;
}
