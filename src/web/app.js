import { h, applyDiff, installStyles, components } from 'anentrypoint-design';
import { fetchHost, ROUTES } from './state.js';
import { PAGES } from './routes.js';

const { AppShell, Topbar, Side, Crumb, Status, EmptyState, Chip } = components;

await installStyles();

const root = document.getElementById('app');
root.textContent = 'loading…';
const host0 = await fetchHost();
root.innerHTML = '';

const state = { active: 'home', ts: new Date().toLocaleTimeString(), body: null, error: null };

function buildSide() {
    return Side({ sections: [{ group: 'freddie', items: ROUTES.map(r => ({
        glyph: r.glyph, label: r.label, href: '#fd-' + r.path,
        active: state.active === r.path,
        onClick: ev => { ev.preventDefault(); setActive(r.path); },
    })) }] });
}

function view() {
    const route = ROUTES.find(r => r.path === state.active) || ROUTES[0];
    const body = state.body || EmptyState({ text: 'loading…', glyph: '◌' });
    const main = h('div', { key: state.active, class: 'fd-page' }, ...(Array.isArray(body) ? body : [body]));
    return AppShell({
        topbar: Topbar({ brand: 'freddie', leaf: 'dashboard', items: [], active: '' }),
        crumb: Crumb({ trail: ['freddie'], leaf: route.path, right: state.error ? Chip({ tone: 'miss', children: 'error' }) : Chip({ tone: 'ok', children: 'live' }) }),
        side: buildSide(),
        main,
        status: Status({ left: ['ds-247420 · webjsx · ' + ROUTES.length + ' routes'], right: [state.ts] }),
    });
}

function rerender() { applyDiff(root, view()); }

function setActive(p) { state.active = p; state.body = null; rerender(); loadActive(); }
if (typeof window !== 'undefined') window.__fd_nav = setActive;

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
        const { Panel } = components;
        state.body = Panel({ title: 'page error', children: h('pre', { class: 'fd-pre fd-page-error' }, state.error) });
    }
    state.ts = new Date().toLocaleTimeString();
    applyDiff(root, view());
}

applyDiff(root, view());
loadActive();

if (!window.__debug) window.__debug = {};
window.__debug.dashboard = () => ({ booted: true, tools: host0.pi.tools.size, skills: host0.pi.skills.size, active: state.active });
