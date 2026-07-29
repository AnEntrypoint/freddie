import { h, applyDiff, installStyles, components, theme } from 'anentrypoint-design';
import { fetchHost, ROUTES, ROUTE_GROUPS } from './state.js';
import { PAGES } from './routes.js';

const { AppShell, Topbar, Side, Status, EmptyState, Chip, ThemeToggle, Icon, toast } = components;

// Lazy-load the command palette from the SDK (dynamic import to avoid circular deps).
let _paletteActionCache = null;
function buildPaletteActions() {
    if (_paletteActionCache) return _paletteActionCache;
    _paletteActionCache = ROUTES.map(r => ({
        id: 'nav-' + r.path,
        label: r.label || r.path,
        icon: r.icon || 'circle',
        group: 'Navigate',
        hint: null,
        action: () => { setActive(r.path); },
    }));
    // Add built-in actions
    _paletteActionCache.push(
        { id: 'cmd-new-chat', label: 'New Chat Session', icon: 'forum', group: 'Actions', hint: null, action: () => setActive('chat') },
        { id: 'cmd-terminal', label: 'Open Terminal', icon: 'more-horizontal', group: 'Actions', hint: null, action: () => setActive('terminal') },
        { id: 'cmd-toggle-theme', label: 'Toggle Theme', icon: 'contrast', group: 'Actions', hint: null, action: () => {
            const cur = theme.getTheme();
            const next = cur === 'github-dark' ? 'paper' : (cur === 'paper' ? 'ink' : (cur === 'ink' ? 'auto' : 'github-dark'));
            theme.applyTheme(next);
        }},
        { id: 'cmd-refresh', label: 'Refresh Data', icon: 'refresh', group: 'Actions', hint: null, action: () => location.reload() },
    );
    return _paletteActionCache;
}

await installStyles();
// Apply github-dark theme by default if no stored preference.
if (!theme.getTheme() || theme.getTheme() === 'auto') {
    theme.applyTheme('github-dark');
}
// Apply compact density for pi-web's dense app-chrome feel.
theme.applyDensity('compact');
// Styles installed — lift the FOUC visibility guard (see index.html reset).
document.body.setAttribute('data-ready', '');

const root = document.getElementById('app');
const host0 = await fetchHost();
root.innerHTML = '';

// Stash project name and health at boot for the status bar.
try {
    const proj = host0.pi.projects.active && host0.pi.projects.active();
    if (proj && proj.name) state.project = proj.name;
} catch { /* ignore */ }
if (host0.degraded) state.health = { ok: false, degraded: true };

// Transient mutation-error toast via the SDK's toast() primitive.
// state.js's mutators reject; wrapMutation routes the message here so a
// thrown error is shown to the user instead of vanishing into the console.
function notify(msg, tone = 'error') {
    toast({ message: String(msg || '').slice(0, 300), kind: tone === 'error' ? 'error' : 'info', duration: 6000 });
}
if (typeof window !== 'undefined') window.__fd_notify = notify;

function routeFromHash() {
    const m = String(location.hash || '').match(/^#(?:fd-)?([a-z]+)/i);
    const p = m && m[1];
    return ROUTES.find(r => r.path === p) ? p : 'home';
}
const state = { active: routeFromHash(), ts: new Date().toLocaleTimeString(), body: null, error: null, sampler: { ok: 0, bad: 0, total: 0, error: false }, health: { ok: true, degraded: false }, project: null, model: null };

async function refreshSampler() {
    try {
        const j = await fetch('/api/models/sampler').then(r => r.json());
        const ents = Object.values(j.status || {});
        const next = { total: ents.length, ok: ents.filter(s => s && s.available !== false).length, bad: ents.filter(s => s && s.available === false).length, error: false };
        // Only rerender if the sampler data actually changed.
        if (next.total !== state.sampler.total || next.ok !== state.sampler.ok || next.bad !== state.sampler.bad) {
            state.sampler = next;
            rerender();
        }
    } catch { state.sampler = { ok: 0, bad: 0, total: 0, error: true }; }
}
await refreshSampler();
setInterval(refreshSampler, 15000);

function buildSide() {
    return Side({ sections: ROUTE_GROUPS.map(g => ({
        group: g.group,
        items: g.items.map(r => ({
            glyph: Icon ? Icon(r.icon) : null,
            label: r.label,
            href: '#fd-' + r.path,
            active: state.active === r.path,
            onClick: ev => { ev.preventDefault(); setActive(r.path); },
        })),
    })) });
}

function view() {
    const body = state.body || EmptyState({ text: 'loading...' });
    const main = h('div', { key: state.active, class: 'fd-page' }, ...(Array.isArray(body) ? body : [body]));
    const samplerPill = state.sampler.error
        ? Chip({ tone: 'miss', children: 'sampler err' })
        : state.sampler.total > 0
            ? Chip({ tone: state.sampler.bad > 0 ? 'miss' : 'ok', children: 'sampler ' + state.sampler.ok + '/' + state.sampler.total })
            : Chip({ tone: 'neutral', children: 'sampler —' });
    // Layout lives in .fd-topbar-leaf (index.html reset block) — zero inline CSS.
    const leaf = h('span', { class: 'fd-topbar-leaf' },
        samplerPill, ThemeToggle ? ThemeToggle({}) : null);
    // Topbar items: New Chat as a primary action.
    const topbarItems = [
        ['New Chat', '#fd-chat'],
    ];
    // Ctrl+K hint in the topbar search slot.
    const searchHint = h('span', { class: 'fd-search-hint', 'aria-hidden': 'true' }, 'Ctrl+K');
    // Status bar: agent health, project name, and tool/session counts.
    const healthChip = host0.degraded
        ? Chip({ tone: 'miss', children: 'backend unreachable' })
        : state.error
            ? Chip({ tone: 'miss', children: 'page error' })
            : Chip({ tone: 'ok', children: 'agent running' });
    const projectName = state.project || (host0.pi.projects.active && host0.pi.projects.active().name) || 'default';
    const statusLeft = [
        h('span', { class: 'fd-status-item' }, healthChip),
        h('span', { class: 'fd-status-item' }, 'project: ' + projectName),
        h('span', { class: 'fd-status-item' }, host0.pi.tools.size + ' tools'),
        h('span', { class: 'fd-status-item' }, host0.pi.skills.size + ' skills'),
    ];
    return AppShell({
        topbar: Topbar({ brand: 'freddie', leaf, items: topbarItems, active: '', search: searchHint }),
        side: buildSide(),
        main,
        status: Status({ left: statusLeft, right: [state.ts] }),
    });
}

function rerender() {
    applyDiff(root, view());
}

function setDocTitle(p) {
    const r = ROUTES.find(x => x.path === p);
    document.title = 'freddie · ' + (r ? (r.label || r.path) : p);
}
function focusMain() {
    const main = root.querySelector('#app-main');
    if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: false }); }
}
function setActive(p) {
    if (state.active === p) return;
    state.active = p; state.body = null;
    const want = '#fd-' + p;
    if (location.hash !== want) { try { history.replaceState(null, '', want); } catch { location.hash = want; } }
    setDocTitle(p);
    rerender(); loadActive();
}
if (typeof window !== 'undefined') {
    window.__fd_nav = setActive;
    window.addEventListener('hashchange', () => setActive(routeFromHash()));
}

async function loadActive() {
    const active = state.active;
    try {
        const page = PAGES[active] || PAGES.home;
        const body = await page(host0);
        if (state.active !== active) return;
        state.body = body;
        state.error = null;
    } catch (e) {
        if (state.active !== active) return;
        state.error = String(e && e.stack || e);
        // Reflect the error in the tab title (success path sets it in setActive).
        document.title = 'freddie · ' + active + ' (error)';
        const { Panel } = components;
        state.body = Panel({ title: 'page error', children: h('pre', { class: 'fd-pre fd-page-error' }, state.error) });
    }
    state.ts = new Date().toLocaleTimeString();
    applyDiff(root, view());
    focusMain();
}

setDocTitle(state.active);
applyDiff(root, view());
loadActive();

if (!window.__debug) window.__debug = {};
window.__debug.dashboard = () => ({ booted: true, tools: host0.pi.tools.size, skills: host0.pi.skills.size, active: state.active, sampler: state.sampler });

window.addEventListener('keydown', ev => {
    if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'k' || ev.key === 'K')) {
        ev.preventDefault();
        // Dynamic import of the command palette from the SDK
        import('anentrypoint-design').then(mod => {
            if (mod.openCommandPalette) {
                mod.openCommandPalette({ actions: buildPaletteActions() });
            }
        }).catch(() => {
            // Fallback: navigate to chat
            if (state.active !== 'chat') setActive('chat');
            setTimeout(() => { const ta = root.querySelector('textarea[name="prompt"]'); if (ta) ta.focus(); }, 100);
        });
    }
});
