import { h, applyDiff, installStyles, components } from 'anentrypoint-design';
import { fetchHost, ROUTES } from './state.js';
import { PAGES } from './routes.js';

const { AppShell, Topbar, Side, Crumb, Status, EmptyState, Chip, ThemeToggle, Icon } = components;

await installStyles();
// Styles installed — lift the FOUC visibility guard (see index.html reset).
document.body.setAttribute('data-ready', '');

const root = document.getElementById('app');
root.textContent = 'loading…';
const host0 = await fetchHost();
root.innerHTML = '';

// Lightweight transient error surface for mutation failures (config.saveValue,
// chat.send, cron.create, …). state.js's mutators reject; the catch handler in
// each callsite — or state.js's wrapMutation — routes the message here so a
// thrown error is shown to the user instead of vanishing into the console.
let _toastTimer = null;
function notify(msg, tone = 'error') {
    let el = document.getElementById('fd-toast');
    if (!el) { el = document.createElement('div'); el.id = 'fd-toast'; el.className = 'fd-toast'; el.setAttribute('role', 'alert'); document.body.appendChild(el); }
    el.textContent = String(msg || '').slice(0, 300);
    el.dataset.tone = tone;
    el.style.display = 'block';
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.style.display = 'none'; }, 6000);
}
if (typeof window !== 'undefined') window.__fd_notify = notify;

function routeFromHash() {
    const m = String(location.hash || '').match(/^#(?:fd-)?([a-z]+)/i);
    const p = m && m[1];
    return ROUTES.find(r => r.path === p) ? p : 'home';
}
const state = { active: routeFromHash(), ts: new Date().toLocaleTimeString(), body: null, error: null, sampler: { ok: 0, bad: 0, total: 0, error: false } };

async function refreshSampler() {
    try {
        const j = await fetch('/api/models/sampler').then(r => r.json());
        const ents = Object.values(j.status || {});
        state.sampler = { total: ents.length, ok: ents.filter(s => s && s.available !== false).length, bad: ents.filter(s => s && s.available === false).length, error: false };
    } catch { state.sampler = { ok: 0, bad: 0, total: 0, error: true }; }
}
await refreshSampler();
setInterval(() => { refreshSampler().then(rerender); }, 15000);

function buildSide() {
    return Side({ sections: [{ group: 'freddie', items: ROUTES.map(r => ({
        glyph: Icon ? Icon(r.icon) : null, label: r.label, href: '#fd-' + r.path,
        active: state.active === r.path,
        onClick: ev => { ev.preventDefault(); setActive(r.path); },
    })) }] });
}

function view() {
    const route = ROUTES.find(r => r.path === state.active) || ROUTES[0];
    const body = state.body || EmptyState({ text: 'loading…' });
    const main = h('div', { key: state.active, class: 'fd-page' }, ...(Array.isArray(body) ? body : [body]));
    const samplerPill = state.sampler.error
        ? Chip({ tone: 'miss', children: 'sampler err' })
        : state.sampler.total > 0
            ? Chip({ tone: state.sampler.bad > 0 ? 'miss' : 'ok', children: 'sampler ' + state.sampler.ok + '/' + state.sampler.total })
            : Chip({ tone: 'neutral', children: 'sampler —' });
    // Layout lives in .fd-topbar-leaf (index.html reset block) — zero inline CSS.
    const leaf = h('span', { class: 'fd-topbar-leaf' },
        samplerPill, ThemeToggle ? ThemeToggle({ compact: true }) : null);
    return AppShell({
        topbar: Topbar({ brand: 'freddie', leaf, items: [], active: '' }),
        crumb: Crumb({ trail: ['freddie'], leaf: route.label || route.path, right: state.error ? Chip({ tone: 'miss', children: 'error' }) : Chip({ tone: 'ok', children: 'live' }) }),
        side: buildSide(),
        main,
        status: Status({ left: ['ds-247420 · webjsx · ' + ROUTES.length + ' routes'], right: [state.ts] }),
    });
}

function rerender() {
    // LIVE-ROUTE RECOMPUTE HOOK: rerender() reuses the cached state.body. No
    // freddie route currently streams (SSE/live updates) — pages are computed
    // once per nav in loadActive(). If a live route is added (e.g. 'chat' with
    // SSE), recompute its body here before applyDiff, per AGENTS.md:
    //   if (state.active === 'chat') { Promise.resolve(PAGES.chat(host0)).then(b => { state.body = b; applyDiff(root, view()); }); return; }
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
        if (state.active !== 'chat') setActive('chat');
        setTimeout(() => { const ta = root.querySelector('textarea[name="prompt"]'); if (ta) ta.focus(); }, 100);
    }
});
