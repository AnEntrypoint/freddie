import { createFreddieDashboard } from '/vendor/anentrypoint-design/desktop/freddie-dashboard.js';
import { installStyles } from 'anentrypoint-design';

await installStyles();

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = '/vendor/anentrypoint-design/desktop/freddie-dashboard.css';
document.head.appendChild(link);

const j = async (u, opts) => { const r = await fetch(u, opts); if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return await r.json(); };
const post = (u, body) => j(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function regFromArray(arr, keyFn = (x) => x.name) {
    const m = new Map();
    for (const it of arr || []) m.set(keyFn(it), it);
    return { get: (k) => m.get(k), has: (k) => m.has(k), list: () => [...m.values()], values: () => m.values(), get size() { return m.size; } };
}

async function fetchHost() {
    const [tools, skillsResp, cron, projectsResp, env, gateway, health, commands] = await Promise.all([
        j('/api/tools/detail').catch(() => []),
        j('/api/skills').catch(() => ({ home: [], bundled: [] })),
        j('/api/cron').catch(() => []),
        j('/api/projects').catch(() => ({ active: null, projects: [] })),
        j('/api/env').catch(() => []),
        j('/api/gateway').catch(() => ({ platforms: [] })),
        j('/api/health').catch(() => ({ ok: false })),
        j('/api/commands').catch(() => []),
    ]);
    const skillList = [...(skillsResp.home || []), ...(skillsResp.bundled || [])];
    const projList = projectsResp.projects || [];
    return {
        kind: 'freddie-web', version: 'web',
        pi: {
            tools: regFromArray(tools),
            skills: regFromArray(skillList, (s) => s.name || s.id),
            cli: regFromArray(commands),
            projects: {
                list: () => projList,
                active: () => projectsResp.active,
                create: ({ name, path }) => post('/api/projects', { name, path }).then(() => location.reload()),
                remove: (name) => fetch('/api/projects/' + encodeURIComponent(name), { method: 'DELETE' }).then(() => location.reload()),
                setActive: (name) => post('/api/projects/active', { name }).then(() => location.reload()),
            },
            sessions: {
                list: () => j('/api/sessions').catch(() => []),
                getMessages: (id) => j('/api/sessions/' + encodeURIComponent(id) + '/messages').catch(() => []),
                search: (q) => j('/api/search?q=' + encodeURIComponent(q)).catch(() => []),
            },
            cron: {
                list: () => Promise.resolve(cron),
                create: (job) => post('/api/cron', job),
                delete: (id) => fetch('/api/cron/' + id, { method: 'DELETE' }),
            },
            env: { list: () => env, isSet: (k) => (env.find(e => e.key === k) || {}).set || false },
            gateway: { platforms: () => gateway.platforms || [] },
            agents: () => j('/api/agents').catch(() => ({ count: 0, turns: 0, active: null })),
            health: () => health,
            config: {
                load: () => j('/api/config').catch(() => ({})),
                saveValue: (path, value) => post('/api/config', { path, value }),
            },
            chat: { send: (text) => post('/api/chat', { text }) },
            batch: { run: (prompts, conc) => post('/api/batch', { prompts, concurrency: conc }) },
            hooks: {},
        },
    };
}

const root = document.getElementById('app');
root.textContent = 'loading…';
const host = await fetchHost();
root.innerHTML = '';
const inst = { id: 'web', fs: { list: () => Promise.resolve([]) }, host };
const { node } = createFreddieDashboard({ instance: inst });
root.appendChild(node);

if (!window.__debug) window.__debug = {};
window.__debug.dashboard = () => ({ booted: true, mode: 'fetchHost', tools: host.pi.tools.size, skills: host.pi.skills.size });
