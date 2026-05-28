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
                saveValue: (key, value) => post('/api/config', { key, value }),
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
    { path: 'voice',     label: 'voice',     glyph: '◍' },
    { path: 'sessions',  label: 'sessions',  glyph: '✉' },
    { path: 'projects',  label: 'projects',  glyph: '◆' },
    { path: 'agents',    label: 'agents',    glyph: '◈' },
    { path: 'analytics', label: 'analytics', glyph: '◉' },
    { path: 'models',    label: 'models',    glyph: '◎' },
    { path: 'cron',      label: 'cron',      glyph: '◷' },
    { path: 'skills',    label: 'skills',    glyph: '✦' },
    { path: 'config',    label: 'config',    glyph: '⚙' },
    { path: 'env',       label: 'keys',      glyph: '⚿' },
    { path: 'tools',     label: 'tools',     glyph: '⚒' },
    { path: 'batch',     label: 'batch',     glyph: '⊞' },
    { path: 'gateway',   label: 'gateway',   glyph: '⇌' },
    { path: 'chains',    label: 'chains',    glyph: '⛓' },
    { path: 'machines',  label: 'machines',  glyph: '⚙' },
    { path: 'health',    label: 'health',    glyph: '✚' },
    { path: 'debug',     label: 'debug',     glyph: '☲' },
];

export function pre(obj) {
    return h('pre', { class: 'fd-pre' }, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

export { skillLabel, getRecentPaths, saveRecentPath, renderChatMessages } from 'anentrypoint-design';
