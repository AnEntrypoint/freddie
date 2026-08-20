import { h, applyDiff, installStyles, components, theme, renderDashboardShell, buildNavPaletteActions } from 'anentrypoint-design';
import { fetchHost, ROUTES, ROUTE_GROUPS } from './state.js';
import { PAGES } from './routes.js';

const { EmptyState, Panel, toast } = components;

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

function routeFromHash() {
    // [a-z-]+ (not [a-z]+) so a hyphenated path like 'session-tree' captures
    // whole -- the letters-only form truncated at the hyphen to 'session',
    // which never matches a real ROUTES entry and silently fell back to
    // 'home' on every #fd-session-tree navigation (including a sidebar click).
    const m = String(location.hash || '').match(/^#(?:fd-)?([a-z-]+)/i);
    const p = m && m[1];
    return ROUTES.find(r => r.path === p) ? p : 'home';
}
const state = { active: routeFromHash(), ts: new Date().toLocaleTimeString(), body: null, error: null, sampler: { ok: 0, bad: 0, total: 0, error: false }, health: { ok: true, degraded: false }, project: null, model: null };

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

// The SDK owns the AppShell/Topbar/Side/Status composition and the chat
// page's fullBleed special-case (see renderDashboardShell's own doc comment)
// — this is bootstrap glue over it, not a component definition.
function view() {
    const body = state.body || EmptyState({ text: 'loading...' });
    const projectName = state.project || (host0.pi.projects.active && host0.pi.projects.active().name) || 'default';
    return renderDashboardShell({
        active: state.active,
        body,
        routeGroups: ROUTE_GROUPS,
        onNavigate: setActive,
        sampler: state.sampler,
        degraded: host0.degraded,
        error: state.error,
        project: projectName,
        toolsCount: host0.pi.tools.size,
        skillsCount: host0.pi.skills.size,
        ts: state.ts,
        fullBleed: state.active === 'chat' && !!state.body,
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
                mod.openCommandPalette({ actions: buildNavPaletteActions(ROUTES, { onNavigate: setActive }) });
            }
        }).catch(() => {
            // Fallback: navigate to chat
            if (state.active !== 'chat') setActive('chat');
            setTimeout(() => { const ta = root.querySelector('textarea[name="prompt"]'); if (ta) ta.focus(); }, 100);
        });
    }
});
