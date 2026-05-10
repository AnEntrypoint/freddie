import { h, components } from 'anentrypoint-design';
import { j, post, pre, getRecentPaths, saveRecentPath, skillLabel, renderChatMessages } from './state.js';

const { Panel, Row, Hero, Receipt, Kpi, Table, EmptyState, Chip, Form } = components;

export const PAGES = {
    async home(h0) {
        const sessions = await h0.pi.sessions.list();
        const health = h0.pi.health();
        return [
            Hero({ title: 'freddie', body: 'open js agent harness — pi-mono · xstate · floosie · anentrypoint-design.', accent: h0.version || 'web' }),
            Kpi({ items: [[sessions.length, 'sessions'], [h0.pi.tools.size, 'tools'], [h0.pi.skills.size, 'skills']] }),
            Panel({ title: 'quick start', children: Receipt({ rows: [
                ['open chat',   "click 'chat' — set a working directory and pick a skill"],
                ['pick skill',  'software dev, research, planning — shown with descriptions'],
                ['pick model',  'select a configured provider + model in the chat bar'],
                ['set api key', 'keys tab → click chip to set value'],
                ['add cron',    'cron tab → form'],
            ] }) }),
            Panel({ title: 'host', children: Receipt({ rows: Object.entries(health).map(([k, v]) => [k, String(v)]) }) }),
        ];
    },
    async chat(h0) {
        const skills = [...h0.pi.skills.values()];
        const providers = await fetch('/api/providers').then(r => r.json()).catch(() => []);
        const configured = providers.filter(p => p.configured);
        const cs = window.__fd_chatState = window.__fd_chatState || {
            cwd: '', skill: '', provider: '', model: '', messages: [], busy: false, sessionId: null,
        };
        if (!cs.cwd) cs.cwd = (getRecentPaths()[0] || '');
        const root = document.getElementById('app');
        const getMsgs = () => root.querySelector('#fd-chat-msgs');
        function newSession() {
            if (cs.busy) return;
            cs.messages = []; cs.sessionId = null;
            renderChatMessages(getMsgs(), cs.messages);
        }
        const parseSse = text => {
            const evs = []; let ev = null, data = '';
            for (const line of text.split('\n')) {
                if (line.startsWith('event: ')) ev = line.slice(7).trim();
                else if (line.startsWith('data: ')) data = line.slice(6).trim();
                else if (line === '' && ev) { try { evs.push({ event: ev, data: JSON.parse(data) }); } catch {} ev = null; data = ''; }
            }
            return evs;
        };
        const sendChat = async ev => {
            ev.preventDefault();
            if (cs.busy) return;
            const promptEl = ev.target.elements.prompt;
            const prompt = promptEl.value.trim();
            if (!prompt) return;
            cs.messages.push({ role: 'user', content: prompt });
            promptEl.value = ''; promptEl.style.height = 'auto'; cs.busy = true;
            saveRecentPath(cs.cwd);
            renderChatMessages(getMsgs(), cs.messages);
            try {
                const body = { prompt, cwd: cs.cwd || undefined, skill: cs.skill || undefined, provider: cs.provider || undefined, model: cs.model || undefined, sessionId: cs.sessionId || undefined };
                const resp = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
                const text = await resp.text();
                const events = parseSse(text);
                let assistantContent = '';
                for (const { event, data } of events) {
                    if (event === 'start' && data.sessionId) cs.sessionId = data.sessionId;
                    if (event === 'done' && data.sessionId) cs.sessionId = data.sessionId;
                    if (event === 'message') {
                        if (data.role === 'assistant') {
                            const content = Array.isArray(data.content) ? data.content : [{ type: 'text', text: String(data.content || '') }];
                            for (const block of content) {
                                if (block.type === 'text') assistantContent += block.text;
                                if (block.type === 'tool_use') {
                                    if (assistantContent) { cs.messages.push({ role: 'assistant', content: assistantContent }); assistantContent = ''; }
                                    cs.messages.push({ role: 'tool', name: block.name, argsSummary: JSON.stringify(block.input || {}).slice(0, 60), content: JSON.stringify(block.input || {}, null, 2) });
                                }
                            }
                        } else if (data.role === 'tool') {
                            const tc = Array.isArray(data.content) ? data.content[0] : data;
                            cs.messages.push({ role: 'tool', name: 'result', argsSummary: '', content: String(tc?.content || tc?.text || JSON.stringify(tc)) });
                        }
                    }
                    if (event === 'done' && data.result && !assistantContent) assistantContent = data.result;
                    if (event === 'error') assistantContent = 'error: ' + (data.error || 'unknown');
                }
                if (assistantContent) cs.messages.push({ role: 'assistant', content: assistantContent });
                if (!events.length) cs.messages.push({ role: 'assistant', content: '(no response)' });
            } catch (e) { cs.messages.push({ role: 'assistant', content: 'error: ' + e.message }); }
            cs.busy = false;
            renderChatMessages(getMsgs(), cs.messages);
        };
        const byCat = skills.reduce((a, s) => { const c = s.category || 'other'; (a[c] = a[c] || []).push(s); return a; }, {});
        setTimeout(() => renderChatMessages(getMsgs(), cs.messages), 50);
        return [
            Panel({
                title: 'chat',
                right: h('button', { class: 'btn-primary', onclick: ev => { ev.preventDefault(); newSession(); } }, '+ new'),
                children: [
                    h('form', { class: 'row-form', onsubmit: sendChat },
                        h('label', { class: 'fd-label' }, 'WORKING DIRECTORY'),
                        h('input', { name: 'cwd', type: 'text', placeholder: 'e.g. C:/dev/myproject', value: cs.cwd, oninput: ev => { cs.cwd = ev.target.value; } }),
                        h('div', { class: 'fd-row' },
                            h('div', { class: 'fd-col' },
                                h('label', { class: 'fd-label' }, 'SKILL'),
                                h('select', { name: 'skill', onchange: ev => { cs.skill = ev.target.value; } },
                                    h('option', { value: '' }, '— no skill —'),
                                    ...Object.entries(byCat).map(([cat, ss]) =>
                                        h('optgroup', { label: cat }, ...ss.map(s => h('option', { value: s.name, selected: cs.skill === s.name ? 'true' : null }, skillLabel(s))))
                                    )
                                )
                            ),
                            h('div', { class: 'fd-col' },
                                h('label', { class: 'fd-label' }, 'PROVIDER'),
                                h('select', { name: 'provider', onchange: ev => { cs.provider = ev.target.value; } },
                                    h('option', { value: '' }, configured.length ? '— auto —' : '— none configured —'),
                                    ...configured.map(p => h('option', { value: p.name, selected: cs.provider === p.name ? 'true' : null }, (p.available ? '● ' : '○ ') + p.name))
                                )
                            ),
                            h('div', { class: 'fd-col' },
                                h('label', { class: 'fd-label' }, 'MODEL'),
                                h('input', { name: 'model', type: 'text', placeholder: 'default', value: cs.model, oninput: ev => { cs.model = ev.target.value; } })
                            )
                        ),
                        h('div', { class: 'fd-row fd-row-send' },
                            h('textarea', { name: 'prompt', placeholder: 'describe what you want…', rows: 4,
                                oninput: ev => { ev.target.style.height = 'auto'; ev.target.style.height = Math.min(ev.target.scrollHeight, 240) + 'px'; } }),
                            h('button', { type: 'submit', class: 'btn-primary', disabled: cs.busy ? 'true' : null }, cs.busy ? '…' : 'send')
                        )
                    ),
                    h('div', { id: 'fd-chat-msgs', class: 'fd-chat-thread' }),
                ],
            }),
            configured.length === 0
                ? Panel({ title: 'no providers configured', children: Receipt({ rows: [
                    ['set API key', 'keys tab → click a chip to set its key'],
                    ['or use acptoapi', 'run acptoapi server on localhost:4800 for local LLMs'],
                ] }) })
                : Panel({ title: 'providers', children: h('div', { class: 'fd-chips' },
                    ...providers.map(p => Chip({ tone: p.configured ? (p.available ? 'ok' : 'warn') : 'miss', children: p.name + (p.configured ? (p.available ? ' ●' : ' ○') : '') }))
                ) }),
        ];
    },
    async sessions(h0) {
        const list = await h0.pi.sessions.list();
        const rows = list.map(s => {
            const cont = h('button', { class: 'btn-primary', onclick: async () => {
                const msgs = await h0.pi.sessions.getMessages(s.id);
                const cs = window.__fd_chatState = window.__fd_chatState || { messages: [], busy: false, sessionId: null, cwd: '', skill: '', provider: '', model: '' };
                cs.sessionId = s.id; cs.messages = msgs.map(m => ({ role: m.role, content: String(m.content || '') }));
                if (s.cwd) cs.cwd = s.cwd;
                if (s.skill) cs.skill = s.skill;
                if (typeof window.__fd_nav === 'function') window.__fd_nav('chat');
            } }, 'continue');
            return [(s.id || '').slice(0, 8), s.title || '—', s.platform || '—', s.model || '—', s.cwd ? s.cwd.slice(-30) : '—', s.skill ? skillLabel({ name: s.skill }) : '—', cont];
        });
        return [
            Kpi({ items: [[list.length, 'sessions']] }),
            Panel({ title: 'sessions', count: list.length, children: list.length === 0
                ? EmptyState({ text: 'no sessions yet', glyph: '✉' })
                : Table({ headers: ['id', 'title', 'platform', 'model', 'cwd', 'skill', ''], rows }) }),
        ];
    },
    async projects(h0) {
        const list = h0.pi.projects.list();
        const active = h0.pi.projects.active();
        const rows = list.map(p => Row({ key: p.name, code: p.name === active?.name ? '●' : '○', title: p.name + (p.name === active?.name ? '  (active)' : ''), meta: p.path,
            onClick: () => { if (p.name !== active?.name) h0.pi.projects.setActive(p.name); } }));
        return [
            Hero({ title: 'projects', body: 'each project is its own ~/.freddie home.', accent: active ? 'active · ' + active.name : 'no active project' }),
            Kpi({ items: [[list.length, 'projects'], [active?.name || '—', 'active']] }),
            Panel({ title: 'add project', children: Form({ fields: [{ name: 'name', placeholder: 'name', required: true }, { name: 'path', placeholder: '/abs/path' }], submit: 'add',
                onSubmit: ev => { h0.pi.projects.create({ name: ev.target.elements.name.value, path: ev.target.elements.path.value }); } }) }),
            Panel({ title: 'all projects', count: list.length, children: rows.length ? rows : EmptyState({ text: 'no projects', glyph: '◆' }) }),
        ];
    },
    async agents(h0) {
        const a = typeof h0.pi.agents === 'function' ? await h0.pi.agents() : { count: 0, turns: 0, active: null };
        return [
            Kpi({ items: [[a.count || 0, 'active'], [a.turns || 0, 'turns']] }),
            Panel({ title: 'agents', children: Receipt({ rows: [['active session', a.active || '(none)'], ['total turns', String(a.turns || 0)]] }) }),
        ];
    },
    async analytics(h0) {
        const list = await h0.pi.sessions.list();
        const tools = [...h0.pi.tools.values()];
        const byPlatform = list.reduce((a, s) => { const k = s.platform || '?'; a[k] = (a[k] || 0) + 1; return a; }, {});
        const byModel = list.reduce((a, s) => { const k = s.model || '?'; a[k] = (a[k] || 0) + 1; return a; }, {});
        return [
            Kpi({ items: [[list.length, 'sessions'], [tools.length, 'tools']] }),
            Panel({ title: 'by platform', children: Object.keys(byPlatform).length === 0 ? EmptyState({ text: 'no data', glyph: '◉' }) : Table({ headers: ['platform', 'count'], rows: Object.entries(byPlatform).sort((a, b) => b[1] - a[1]) }) }),
            Panel({ title: 'by model', children: Object.keys(byModel).length === 0 ? EmptyState({ text: 'no data', glyph: '◎' }) : Table({ headers: ['model', 'count'], rows: Object.entries(byModel).sort((a, b) => b[1] - a[1]) }) }),
        ];
    },
    async models(h0) {
        const cfg = typeof h0.pi.config?.load === 'function' ? await h0.pi.config.load() : {};
        const agent = cfg.agent || {};
        const providers = await fetch('/api/providers').then(r => r.json()).catch(() => []);
        return [
            Kpi({ items: [[agent.provider || '—', 'provider'], [agent.model || '—', 'model']] }),
            Panel({ title: 'active model', children: Receipt({ rows: [['provider', agent.provider || '(unset)'], ['model', agent.model || '(unset)'], ['max_tokens', String(agent.max_tokens || '—')]] }) }),
            Panel({ title: 'change model', children: Form({ fields: [{ name: 'provider', placeholder: 'provider', value: agent.provider || '' }, { name: 'model', placeholder: 'model id', value: agent.model || '' }], submit: 'update',
                onSubmit: async ev => { await h0.pi.config.saveValue('agent.provider', ev.target.elements.provider.value); await h0.pi.config.saveValue('agent.model', ev.target.elements.model.value); } }) }),
            Panel({ title: 'availability', children: h('div', { class: 'fd-chips' }, ...providers.map(p => Chip({ tone: p.configured ? (p.available ? 'ok' : 'warn') : 'miss', children: p.name + (p.configured ? (p.available ? ' ●' : ' ○') : ' ·') }))) }),
        ];
    },
    async cron(h0) {
        const list = await h0.pi.cron.list();
        return [
            Kpi({ items: [[list.length, 'jobs']] }),
            Panel({ title: 'add job', children: Form({ fields: [{ name: 'cron', placeholder: '* * * * *', required: true }, { name: 'prompt', placeholder: 'prompt', required: true }], submit: 'create',
                onSubmit: async ev => { await h0.pi.cron.create({ cron: ev.target.elements.cron.value, prompt: ev.target.elements.prompt.value }); } }) }),
            Panel({ title: 'jobs', count: list.length, children: list.length === 0 ? EmptyState({ text: 'no cron jobs', glyph: '◷' }) : Table({ headers: ['id', 'cron', 'prompt', 'enabled'], rows: list.map(j => [j.id, j.cron, (j.prompt || '').slice(0, 40), j.enabled ? 'yes' : 'no']) }) }),
        ];
    },
    async skills(h0) {
        const list = [...h0.pi.skills.values()];
        const byCat = list.reduce((a, s) => { (a[s.category || 'other'] = a[s.category || 'other'] || []).push(s); return a; }, {});
        return [
            Kpi({ items: [[list.length, 'skills'], [Object.keys(byCat).length, 'categories']] }),
            list.length === 0 ? EmptyState({ text: 'no skills — add SKILL.md files to ~/.freddie/skills/', glyph: '◈' }) : null,
            ...Object.entries(byCat).map(([cat, ss]) => Panel({ title: cat, count: ss.length, children: Table({ headers: ['name', 'description'], rows: ss.map(s => [skillLabel(s), (s.description || '').slice(0, 120)]) }) })),
        ].filter(Boolean);
    },
    async config(h0) {
        const cfg = typeof h0.pi.config?.load === 'function' ? await h0.pi.config.load() : {};
        const commands = typeof h0.pi.cli?.values === 'function' ? [...h0.pi.cli.values()] : [];
        return [
            Kpi({ items: [[commands.length, 'commands'], [cfg._config_version || 0, 'config version']] }),
            Panel({ title: 'set config value', children: Form({ fields: [{ name: 'key', placeholder: 'dotted.key', required: true }, { name: 'value', placeholder: 'value (json or string)', required: true }], submit: 'save',
                onSubmit: async ev => { let v = ev.target.elements.value.value; try { v = JSON.parse(v); } catch {} await h0.pi.config.saveValue(ev.target.elements.key.value, v); } }) }),
            Panel({ title: 'commands', count: commands.length, children: Table({ headers: ['name', 'description'], rows: commands.map(c => [c.name, c.description || '']) }) }),
            Panel({ title: 'active config', children: pre(cfg) }),
        ];
    },
    async env(h0) {
        const list = typeof h0.pi.env?.list === 'function' ? h0.pi.env.list() : [];
        const setCount = list.filter(k => k.set).length;
        return [
            Kpi({ items: [[setCount, 'set'], [list.length - setCount, 'missing'], [list.length, 'total']] }),
            Panel({ title: 'environment variables', children: h('div', { class: 'fd-chips' },
                ...list.map(k => h('span', { key: k.key, onclick: () => {
                    const v = prompt('set ' + k.key + ' (empty to unset):');
                    if (v == null) return;
                    if (typeof h0.pi.env.set === 'function') { h0.pi.env.set(k.key, v); }
                }, class: 'fd-chip-wrap' }, Chip({ tone: k.set ? 'ok' : 'miss', children: k.key + (k.set ? ' ✓' : ' ·') })))
            ) }),
        ];
    },
    async tools(h0) {
        const list = [...h0.pi.tools.values()];
        const bySet = list.reduce((a, t) => { (a[t.toolset || 'core'] = a[t.toolset || 'core'] || []).push(t); return a; }, {});
        return [
            Kpi({ items: [[list.length, 'tools'], [Object.keys(bySet).length, 'toolsets']] }),
            ...Object.entries(bySet).map(([ts, items]) => Panel({ title: 'toolset · ' + ts, count: items.length,
                children: items.map(t => Row({ key: t.name, code: '⚒', title: t.name, sub: (t.description || (t.schema && t.schema.description) || '').slice(0, 80) })) })),
        ];
    },
    async batch(h0) {
        const out = h('div', { id: 'fd-batch-out' });
        return [
            Panel({ title: 'run batch', children: Form({
                fields: [{ name: 'prompts', kind: 'textarea', placeholder: 'one prompt per line', rows: 6 }, { name: 'concurrency', type: 'number', value: '4' }],
                submit: 'run',
                onSubmit: async ev => {
                    const prompts = ev.target.elements.prompts.value.split('\n').map(s => s.trim()).filter(Boolean);
                    if (!prompts.length) return;
                    const root = document.getElementById('app');
                    const node = root.querySelector('#fd-batch-out');
                    if (node) node.textContent = 'running…';
                    try {
                        const r = await h0.pi.batch.run({ prompts, concurrency: Number(ev.target.elements.concurrency.value) || 4 });
                        if (node) node.textContent = JSON.stringify(r, null, 2);
                    } catch (e) { if (node) node.textContent = 'error: ' + (e.message || e); }
                },
            }) }),
            Panel({ title: 'results', children: out }),
        ];
    },
    async gateway(h0) {
        const platforms = typeof h0.pi.gateway?.platforms === 'function' ? h0.pi.gateway.platforms() : [];
        const active = platforms.filter(p => p.enabled);
        return [
            Kpi({ items: [[platforms.length, 'platforms'], [active.length, 'active']] }),
            Panel({ title: 'platforms', count: platforms.length,
                right: active.length > 0 ? Chip({ tone: 'ok', children: active.length + ' active' }) : Chip({ tone: 'miss', children: 'none active' }),
                children: platforms.length === 0 ? EmptyState({ text: 'no platforms registered', glyph: '⇌' }) : platforms.map(p => Row({ key: p.name, code: p.enabled ? '●' : '○', title: p.name, sub: p.note || '', meta: p.enabled ? 'enabled' : '' })) }),
        ];
    },
};
