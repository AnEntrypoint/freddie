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
    return Side({ sections: [{ group: 'FREDDIE', items: ROUTES.map(r => ({
        glyph: r.glyph, label: r.label, href: '#fd-' + r.path,
        active: state.active === r.path,
        onClick: ev => { ev.preventDefault(); setActive(r.path); },
    })) }] });
}

function view() {
    const route = ROUTES.find(r => r.path === state.active) || ROUTES[0];
    return AppShell({
        topbar: Topbar({ brand: 'freddie', leaf: 'dashboard', items: [], active: '' }),
        crumb: Crumb({ trail: ['freddie'], leaf: route.path, right: state.error ? Chip({ tone: 'miss', children: 'error' }) : Chip({ tone: 'ok', children: 'live' }) }),
        side: buildSide(),
        main: state.body || EmptyState({ text: 'loading…', glyph: '◌' }),
        status: Status({ left: ['ds-247420 · webjsx · ' + ROUTES.length + ' routes'], right: [state.ts] }),
    });
}

function rerender() { applyDiff(root, view()); loadActive(); }

function setActive(p) { state.active = p; rerender(); }
if (typeof window !== 'undefined') window.__fd_nav = setActive;

async function loadActive() {
    try {
        const page = PAGES[state.active] || PAGES.home;
        state.body = await page(host0);
        state.error = null;
    } catch (e) {
        state.error = String(e && e.stack || e);
        const { Panel } = components;
        state.body = Panel({ title: 'error', children: h('pre', { class: 'fd-pre' }, state.error) });
    }
    state.ts = new Date().toLocaleTimeString();
    applyDiff(root, view());
}

applyDiff(root, view());
loadActive();

if (!window.__debug) window.__debug = {};
window.__debug.dashboard = () => ({ booted: true, tools: host0.pi.tools.size, skills: host0.pi.skills.size, active: state.active });
