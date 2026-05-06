import { icons } from './icons.js';

const THEME_CSS_URL = new URL('./theme.css', import.meta.url).href;

function ensureCss(href) {
    if (document.querySelector('link[data-os-theme]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href || THEME_CSS_URL;
    l.dataset.osTheme = '1';
    document.head.appendChild(l);
}

function ic(svg) {
    const s = document.createElement('span');
    s.className = 'ic';
    s.innerHTML = svg;
    return s;
}

function makeBtn(svg, label, role) {
    const b = document.createElement('button');
    b.className = 'os-btn';
    b.type = 'button';
    if (role) b.dataset.role = role;
    if (svg) b.append(ic(svg));
    if (label) b.append(Object.assign(document.createElement('span'), { textContent: label }));
    return b;
}

export function createDesktopShell({ root = document.body, wm, registry, brand = 'desktop', themeUrl, onNewInstance, autoBoot = false } = {}) {
    if (!wm) throw new Error('createDesktopShell: wm is required');
    if (!registry) throw new Error('createDesktopShell: registry is required');
    ensureCss(themeUrl);

    const osRoot = document.createElement('div');
    osRoot.className = 'os-root';
    root.appendChild(osRoot);

    const menubar = document.createElement('div');
    menubar.className = 'os-menubar';

    const homeBtn = makeBtn(icons.home, '', 'home');
    homeBtn.title = 'apps';

    const brandEl = document.createElement('span');
    brandEl.className = 'os-brand';
    brandEl.textContent = brand;

    const appsBtn = makeBtn(icons.apps, 'apps', 'apps');
    const newInstBtn = onNewInstance ? makeBtn(icons.plus, 'instance', 'add') : null;

    const instSwitch = document.createElement('div');
    instSwitch.className = 'os-instances';

    const spacer = document.createElement('div');
    spacer.className = 'os-spacer';

    const tray = document.createElement('div');
    tray.className = 'os-tray';
    const clock = document.createElement('span');
    clock.className = 'os-clock';
    tray.appendChild(clock);

    menubar.append(homeBtn, brandEl, appsBtn);
    if (newInstBtn) menubar.append(newInstBtn);
    menubar.append(instSwitch, spacer, tray);

    const appsMenu = document.createElement('div');
    appsMenu.className = 'os-menu';

    const sideRail = document.createElement('div');
    sideRail.className = 'os-side-rail';

    const drawer = document.createElement('div');
    drawer.className = 'os-drawer';
    drawer.setAttribute('aria-hidden', 'true');
    const drawerHeader = document.createElement('div');
    drawerHeader.className = 'os-drawer-head';
    const drawerTitle = document.createElement('span');
    drawerTitle.className = 'os-drawer-title';
    drawerTitle.textContent = 'apps';
    const drawerClose = document.createElement('button');
    drawerClose.className = 'os-drawer-close';
    drawerClose.type = 'button';
    drawerClose.append(ic(icons.close));
    drawerHeader.append(drawerTitle, drawerClose);
    const drawerGrid = document.createElement('div');
    drawerGrid.className = 'os-drawer-grid';
    drawer.append(drawerHeader, drawerGrid);

    const apps = typeof registry.list === 'function' ? registry.list() : [...registry.values()];

    for (const app of apps) {
        const iconSvg = app.icon || icons[app.id] || '';
        const menuBtn = makeBtn(iconSvg, app.name);
        menuBtn.addEventListener('click', () => { closeMenu(); openApp(app.id); });
        appsMenu.appendChild(menuBtn);

        const railBtn = document.createElement('button');
        railBtn.className = 'os-rail-btn';
        railBtn.type = 'button';
        railBtn.title = app.name;
        railBtn.append(ic(iconSvg));
        railBtn.addEventListener('click', () => openApp(app.id));
        sideRail.appendChild(railBtn);

        const tile = document.createElement('button');
        tile.className = 'os-drawer-tile';
        tile.type = 'button';
        tile.append(ic(iconSvg), Object.assign(document.createElement('span'), { className: 'lbl', textContent: app.name }));
        tile.addEventListener('click', () => { closeDrawer(); openApp(app.id); });
        drawerGrid.appendChild(tile);
    }

    const taskbar = document.createElement('div');
    taskbar.className = 'os-taskbar';

    osRoot.append(menubar, appsMenu, taskbar);
    document.body.append(sideRail, drawer);

    function openMenu() { appsMenu.classList.add('open'); }
    function closeMenu() { appsMenu.classList.remove('open'); }
    function openDrawer() { drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); }
    function closeDrawer() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); }

    appsBtn.addEventListener('click', e => { e.stopPropagation(); appsMenu.classList.toggle('open'); });
    homeBtn.addEventListener('click', e => { e.stopPropagation(); drawer.classList.contains('open') ? closeDrawer() : openDrawer(); });
    drawerClose.addEventListener('click', closeDrawer);
    drawer.addEventListener('click', e => { if (e.target === drawer) closeDrawer(); });
    document.addEventListener('click', e => {
        if (!appsMenu.contains(e.target) && !appsBtn.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeMenu(); closeDrawer(); }
    });

    function tickClock() { clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    tickClock();
    const clockTimer = setInterval(tickClock, 30000);

    let activeContext = null;
    function setContext(ctx) { activeContext = ctx; }

    function refreshTaskbar() {
        taskbar.innerHTML = '';
        for (const w of wm.list()) {
            const t = document.createElement('button');
            t.className = 'os-task' + (w.focused ? ' focused' : '');
            t.type = 'button';
            t.textContent = w.title;
            t.dataset.winId = w.id;
            t.addEventListener('click', () => wm.focus(w.id));
            taskbar.appendChild(t);
        }
    }

    function openApp(appId) {
        const app = (typeof registry.get === 'function') ? registry.get(appId) : registry[appId];
        if (!app) throw new Error('unknown app: ' + appId);
        const ctx = { ...(activeContext || {}), registry, openApp, wm };
        const result = app.factory(ctx);
        const finish = (r) => {
            const sz = app.defaultSize || { w: 520, h: 360 };
            const titlePrefix = (activeContext && activeContext.titlePrefix) ? activeContext.titlePrefix + ' · ' : '';
            const win = wm.open({ title: titlePrefix + app.name, body: r.node, kind: appId, width: sz.w, height: sz.h, x: 100 + (wm.count * 28) % 240, y: 80 + (wm.count * 22) % 180 });
            win._app = { id: appId, dispose: r.dispose };
            refreshTaskbar();
            return win;
        };
        return (result && typeof result.then === 'function') ? result.then(finish) : finish(result);
    }

    if (newInstBtn) newInstBtn.addEventListener('click', () => onNewInstance && onNewInstance({ instSwitch, setContext, openApp }));

    const taskTimer = setInterval(refreshTaskbar, 500);

    const api = {
        wm, registry, openApp, setContext, refreshTaskbar,
        openDrawer, closeDrawer, openMenu, closeMenu,
        elements: { osRoot, menubar, taskbar, appsMenu, sideRail, drawer, instSwitch, homeBtn, appsBtn },
        dispose() { clearInterval(clockTimer); clearInterval(taskTimer); osRoot.remove(); sideRail.remove(); drawer.remove(); },
    };

    if (autoBoot && typeof autoBoot === 'string') openApp(autoBoot);
    return api;
}
