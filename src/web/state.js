import { h } from 'anentrypoint-design';
import { PAGES } from './routes.js';

export const j = async (u, opts) => {
    const r = await fetch(u, opts);
    if (!r.ok) {
        let detail = '';
        try {
            const ct = r.headers.get('content-type') || '';
            const raw = await r.text();
            if (ct.includes('json')) {
                try { const b = JSON.parse(raw); detail = b.error ? (b.error + (b.hint ? ' — ' + b.hint : '')) : raw; } catch { detail = raw; }
            } else { detail = raw; }
        } catch { /* body unreadable */ }
        throw new Error(r.status + ' ' + r.statusText + (detail ? ': ' + String(detail).slice(0, 500) : ''));
    }
    return r.json();
};
export const post = (u, b) => j(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

// Wrap a mutation so a rejection is surfaced to the user (app.js installs
// window.__fd_notify — a transient toast) AND still rejected, so callers that
// have their own catch/finally (e.g. button spinners) keep working. Without
// this, a thrown mutation error vanished silently into the console.
export function wrapMutation(label, fn) {
    return async (...args) => {
        try { return await fn(...args); }
        catch (e) {
            const msg = label + ' failed: ' + String(e && e.message || e);
            try { if (typeof window !== 'undefined' && window.__fd_notify) window.__fd_notify(msg); } catch { /* notify unavailable */ }
            throw e;
        }
    };
}

export function reg(arr, keyFn = x => x.name) {
    const m = new Map();
    for (const it of arr || []) m.set(keyFn(it), it);
    return { get: k => m.get(k), has: k => m.has(k), list: () => [...m.values()], values: () => m.values(), get size() { return m.size; } };
}

export async function fetchHost() {
    // Track boot fetch failures so app.js can surface a degraded-backend warning.
    let _fails = 0;
    const settled = (p, fb) => p.catch(() => { _fails++; return fb; });
    // Derive WebSocket URL from the current page origin
    const wsProto = (typeof window !== 'undefined' && window.location.protocol === 'https:') ? 'wss:' : 'ws:';
    const wsUrl = typeof window !== 'undefined' ? `${wsProto}//${window.location.host}/api/events` : '';
    const [tools, skillsR, cron, projR, env, gateway, health, commands] = await Promise.all([
        settled(j('/api/tools/detail'), []),
        settled(j('/api/skills'), { home: [], bundled: [] }),
        settled(j('/api/cron'), []),
        settled(j('/api/projects'), { active: null, projects: [] }),
        settled(j('/api/env'), []),
        settled(j('/api/gateway'), { platforms: [] }),
        settled(j('/api/health'), { ok: false }),
        settled(j('/api/commands'), []),
    ]);
    const skillList = [...(skillsR.home || []), ...(skillsR.bundled || [])];
    const projList = projR.projects || [];
    // degraded: every boot endpoint failed — the backend is unreachable/broken.
    const degraded = _fails >= 8;
    return {
        kind: 'freddie-web', version: 'web',
        degraded,
        wsUrl,
        pi: {
            tools: reg(tools),
            skills: reg(skillList, s => s.name || s.id),
            cli: reg(commands),
            projects: {
                list: () => projList,
                active: () => projR.active,
                create: wrapMutation('create project', ({ name, path }) => post('/api/projects', { name, path }).then(() => location.reload())),
                remove: wrapMutation('delete project', name => fetch('/api/projects/' + encodeURIComponent(name), { method: 'DELETE' }).then(() => location.reload())),
                setActive: wrapMutation('switch project', name => post('/api/projects/active', { name }).then(() => location.reload())),
            },
            sessions: {
                list: () => j('/api/sessions').catch(() => []),
                getMessages: id => j('/api/sessions/' + encodeURIComponent(id) + '/messages').catch(() => []),
                search: q => j('/api/search?q=' + encodeURIComponent(q)).catch(() => []),
            },
            cron: {
                list: () => Promise.resolve(cron),
                create: wrapMutation('create cron job', job => post('/api/cron', job)),
                delete: wrapMutation('delete cron job', id => fetch('/api/cron/' + id, { method: 'DELETE' })),
            },
            env: { list: () => env, isSet: k => (env.find(e => e.key === k) || {}).set || false },
            gateway: { platforms: () => gateway.platforms || [] },
            agents: () => j('/api/agents').catch(() => ({ count: 0, turns: 0, active: null })),
            subagents: {
                list: () => j('/api/subagents').catch(() => []),
                get: id => j('/api/subagents/' + encodeURIComponent(id)).catch(() => null),
            },
            health: () => health,
            config: {
                load: () => j('/api/config').catch(() => ({})),
                saveValue: wrapMutation('save config', (key, value) => post('/api/config', { key, value })),
            },
            // Handler reads `prompt` and (for plain fetch) returns `{ result }`.
            chat: { send: wrapMutation('send message', prompt => post('/api/chat', { prompt })) },
            batch: { run: wrapMutation('run batch', (prompts, conc) => post('/api/batch', { prompts, concurrency: conc })) },
            hooks: {},
        },
    };
}

// `icon` is an anentrypoint-design SDK Icon() name (monochrome inline SVG),
// not a decorative unicode glyph — the nav chrome reads as one icon set.
// Route groups for the sidebar. Order within each group is roughly by
// importance; the whole list is still flat for the command palette.
export const ROUTE_GROUPS = [
    {
        group: 'Work',
        items: [
            { path: 'chat',      label: 'chat',      icon: 'forum' },
            { path: 'sessions',  label: 'sessions',  icon: 'thread' },
            { path: 'files',     label: 'files',     icon: 'folder' },
            { path: 'git',       label: 'git',       icon: 'branch' },
            { path: 'terminal',  label: 'terminal',  icon: 'screen' },
        ],
    },
    {
        group: 'Setup',
        items: [
            { path: 'env',       label: 'keys',      icon: 'hash' },
            { path: 'models',    label: 'models',    icon: 'circle-dot' },
            { path: 'projects',  label: 'projects',  icon: 'square' },
            { path: 'cron',      label: 'cron',      icon: 'play' },
            { path: 'logs',      label: 'logs',      icon: 'file-text' },
        ],
    },
];

// Command palette + sidebar show only the curated ROUTE_GROUPS above, but
// route VALIDATION (routeFromHash's is-this-a-real-page check, setDocTitle's
// label lookup) must cover every page FREDDIE_PAGES actually registers —
// otherwise a direct link/bookmark to a page the curated nav omits (e.g.
// #fd-config, #fd-worktree) silently redirects to home instead of rendering.
// Un-curated pages get a bare title-cased label/generic icon: they're
// reachable, just not promoted in the nav chrome.
const curatedPaths = new Set(ROUTE_GROUPS.flatMap(g => g.items).map(r => r.path));
export const ROUTES = [
    ...ROUTE_GROUPS.flatMap(g => g.items),
    ...Object.keys(PAGES).filter(p => !curatedPaths.has(p)).map(path => ({
        path, label: path.replace(/-/g, ' '), icon: 'file-code',
    })),
];

export function pre(obj) {
    return h('pre', { class: 'fd-pre' }, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
}

export { skillLabel, getRecentPaths, saveRecentPath, renderChatMessages } from 'anentrypoint-design';
