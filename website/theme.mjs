const NAV = [
    ['Home', '/'],
    ['Architecture', '/architecture/'],
    ['CLI', '/cli/'],
    ['Tools', '/tools/'],
    ['Platforms', '/platforms/'],
    ['Skills', '/skills/'],
    ['Development', '/development/'],
]

const RAILS = ['rail-green', 'rail-purple', 'rail-mascot', 'rail-sun', 'rail-flame', 'rail-sky']
const DOTS = ['green', 'purple', 'mascot', 'sun', 'flame', 'sky']

function escape(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

function inlineMd(s) {
    return s
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}

function renderMarkdown(md) {
    const lines = String(md || '').split('\n')
    const out = []
    let inCode = false, inList = false
    for (const line of lines) {
        if (line.startsWith('```')) { if (inCode) { out.push('</pre>'); inCode = false } else { out.push('<pre>'); inCode = true } continue }
        if (inCode) { out.push(escape(line)); continue }
        if (line.startsWith('# ')) out.push(`<h1>${escape(line.slice(2))}</h1>`)
        else if (line.startsWith('## ')) out.push(`<h2>${escape(line.slice(3))}</h2>`)
        else if (line.startsWith('### ')) out.push(`<h3>${escape(line.slice(4))}</h3>`)
        else if (line.startsWith('- ')) { if (!inList) { out.push('<ul>'); inList = true } out.push(`<li>${inlineMd(escape(line.slice(2)))}</li>`) }
        else { if (inList) { out.push('</ul>'); inList = false } if (line.trim()) out.push(`<p>${inlineMd(escape(line))}</p>`) }
    }
    if (inList) out.push('</ul>')
    if (inCode) out.push('</pre>')
    return out.join('\n')
}

function pageHtml({ title, slug, hero, sections, examples, body, navItems }) {
    const heroBlock = hero ? `<div class="ds-hero">
  <h1 class="ds-hero-title">${escape(hero.heading || hero.title || title)}</h1>
  ${hero.subheading ? `<p class="ds-hero-body">${escape(hero.subheading)}${hero.accent ? ` <span class="ds-hero-accent">${escape(hero.accent)}</span>` : ''}</p>` : ''}
  ${hero.body ? `<p class="ds-hero-body">${escape(hero.body)}</p>` : ''}
  ${Array.isArray(hero.badges) && hero.badges.length ? `<div class="ds-hero-badges">${hero.badges.map(b => `<span class="chip"><strong>${escape(b.label || '')}</strong>${b.desc ? `<span style="opacity:.7"> ${escape(b.desc)}</span>` : ''}</span>`).join(' ')}</div>` : ''}
  ${Array.isArray(hero.ctas) && hero.ctas.length ? `<div class="ds-hero-ctas" style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">${hero.ctas.map((c, i) => `<a class="${i === 0 ? 'btn-primary' : 'btn'}" href="${escape(c.href || '#')}">${escape(c.label || c.cta || 'go')}</a>`).join('')}</div>` : ''}
</div>` : ''

    const sectionBlocks = (Array.isArray(sections) ? sections : []).map((sec, idx) => {
        const rail = RAILS[idx % RAILS.length]
        const dot = DOTS[idx % DOTS.length]
        const items = (sec.features || sec.items || []).map((f, i) => {
            const benefit = f.benefit ? `<div class="row-benefit" style="opacity:.75;margin-top:4px;font-style:italic">${escape(f.benefit)}</div>` : ''
            return `<div class="row ${rail}" style="border-radius:10px;margin:6px 0;padding:10px 14px;background:var(--panel-2,#F0E9DA)">
  <span class="dot dot-${dot}" style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px;background:currentColor;opacity:.8" aria-hidden="true"></span>
  <span class="title" style="font-weight:600">${escape(f.name)}</span>
  ${f.desc ? `<div class="sub" style="opacity:.85;margin-top:4px">${inlineMd(escape(f.desc))}</div>` : ''}
  ${benefit}
</div>`
        }).join('\n')
        const lede = sec.lede || sec.body && sec.body.length < 240 ? sec.lede || sec.body : ''
        return `<section class="ds-section ${rail}" id="${escape(sec.id || '')}" style="margin:32px 0;padding:18px 22px;background:var(--panel-1,#FBF6EB);border-radius:20px">
  <h2 class="ds-section-title" style="margin-top:0">${escape(sec.name || sec.title || sec.id)}</h2>
  ${lede ? `<p class="ds-lede" style="opacity:.8;max-width:60ch">${escape(lede)}</p>` : ''}
  ${items}
  ${sec.body && sec.body.length >= 240 ? renderMarkdown(sec.body) : ''}
</section>`
    }).join('\n')

    const examplesBlock = Array.isArray(examples) && examples.length ? `<section class="ds-section" style="margin:32px 0;padding:18px 22px;background:var(--panel-1,#FBF6EB);border-radius:20px">
  <h2 class="ds-section-title" style="margin-top:0">explore</h2>
  ${examples.map((e, i) => {
        const rail = RAILS[(i + 1) % RAILS.length]
        return `<a class="row ${rail}" href="${escape(e.href || '#')}" style="display:block;text-decoration:none;color:inherit;padding:10px 14px;margin:6px 0;border-radius:10px;background:var(--panel-2,#F0E9DA)">
  <span class="code" style="font-family:'JetBrains Mono',monospace;opacity:.6;margin-right:12px">${String(i + 1).padStart(2, '0')}</span>
  <span class="title" style="font-weight:600">${escape(e.label || e.name || e.href)}</span>
  ${e.desc ? `<span class="meta" style="opacity:.7;margin-left:8px">— ${escape(e.desc)}</span>` : ''}
  <span style="float:right;opacity:.5">↗</span>
</a>`
    }).join('\n')}
</section>` : ''

    const bodyBlock = body ? `<section class="ds-section page-body" style="margin:32px 0;padding:18px 22px;background:var(--panel-1,#FBF6EB);border-radius:20px">${renderMarkdown(body)}</section>` : ''

    return `<!doctype html>
<html lang="en" class="ds-247420" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} — Freddie</title>
<link rel="stylesheet" href="https://unpkg.com/anentrypoint-design@latest/dist/247420.css">
<script type="importmap">
{ "imports": { "anentrypoint-design": "https://unpkg.com/anentrypoint-design@latest/dist/247420.js" } }
</script>
<style>
.page-body h1 { margin-top: 0 }
.page-body h2 { margin-top: 32px }
.page-body h3 { margin-top: 24px }
.page-body pre { margin: 12px 0; background: var(--panel-2, #F0E9DA); padding: 12px; border-radius: 8px; overflow-x: auto }
.ds-hero { padding: 48px 28px 36px; background: var(--panel-1, #FBF6EB); border-radius: 20px; margin: 24px 0 }
.ds-hero-title { font-family: 'Archivo Black', sans-serif; font-size: clamp(40px, 6vw, 72px); margin: 0 0 16px; letter-spacing: -0.02em }
.ds-hero-body { font-size: 17px; line-height: 1.55; max-width: 64ch; opacity: 0.85 }
.ds-hero-accent { color: var(--mascot, #F07AA8); font-weight: 600 }
.ds-hero-badges { margin-top: 24px; display: flex; gap: 8px; flex-wrap: wrap }
.chip { padding: 6px 12px; border-radius: 6px; background: var(--panel-2, #F0E9DA); font-size: 13px }
.btn, .btn-primary { display: inline-block; padding: 10px 18px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 14px }
.btn { background: var(--panel-2, #F0E9DA); color: inherit }
.btn-primary { background: var(--ink, #1F1B16); color: var(--paper, #F5F0E4) }
.rail-green { box-shadow: inset 4px 0 0 var(--green, #3F8A4A) }
.rail-purple { box-shadow: inset 4px 0 0 var(--purple, #6B3A78) }
.rail-mascot { box-shadow: inset 4px 0 0 var(--mascot, #F07AA8) }
.rail-sun { box-shadow: inset 4px 0 0 var(--sun, #FFD86B) }
.rail-flame { box-shadow: inset 4px 0 0 var(--flame, #FF8454) }
.rail-sky { box-shadow: inset 4px 0 0 var(--sky, #6FA9FF) }
.dot-green { color: var(--green, #3F8A4A) } .dot-purple { color: var(--purple, #6B3A78) }
.dot-mascot { color: var(--mascot, #F07AA8) } .dot-sun { color: var(--sun, #FFD86B) }
.dot-flame { color: var(--flame, #FF8454) } .dot-sky { color: var(--sky, #6FA9FF) }
body { margin: 0 }
.app-stage { max-width: 1100px; margin: 0 auto; padding: 24px }
</style>
</head>
<body>
<div id="app"></div>
<script type="module">
import { mount, components as C } from 'anentrypoint-design';
const navItems = ${JSON.stringify(navItems)};
mount(document.getElementById('app'), () => C.AppShell({
  topbar: C.Topbar({ brand: 'Freddie', items: navItems, active: ${JSON.stringify(title)} }),
  crumb: C.Crumb({ leaf: ${JSON.stringify(title)} }),
  main: C.h('div', { class: 'app-stage', innerHTML: ${JSON.stringify(heroBlock + sectionBlocks + examplesBlock + bodyBlock)} }),
  status: C.Status({ left: ['freddie', ${JSON.stringify(slug)}], right: ['live'] })
}));
</script>
</body>
</html>`
}

export default {
    assets: {},
    async render({ read }) {
        const result = await read('pages')
        const pages = Array.isArray(result) ? result : (result?.docs || [])
        const outputs = []
        for (const page of pages) {
            const slug = page.slug || page.id || 'index'
            const path = (slug === 'home' || slug === 'index') ? 'index.html' : `${slug}/index.html`
            const title = page.title || 'Freddie'
            outputs.push({
                path,
                html: pageHtml({
                    title,
                    slug,
                    hero: page.hero,
                    sections: page.sections,
                    examples: page.examples,
                    body: page.body,
                    navItems: NAV,
                }),
            })
        }
        return outputs
    },
}
