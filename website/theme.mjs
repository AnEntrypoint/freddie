const NAV = [
    { href: '/', label: 'Home', slug: 'home' },
    { href: '/architecture/', label: 'Architecture', slug: 'architecture' },
    { href: '/cli/', label: 'CLI', slug: 'cli' },
    { href: '/tools/', label: 'Tools', slug: 'tools' },
    { href: '/platforms/', label: 'Platforms', slug: 'platforms' },
    { href: '/skills/', label: 'Skills', slug: 'skills' },
    { href: '/development/', label: 'Development', slug: 'development' },
]

function renderMarkdown(md) {
    const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const lines = md.split('\n')
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

function inlineMd(s) {
    return s
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
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

            const bodyHtml = renderMarkdown(page.body || '')

            const html = `<!doctype html>
<html lang="en" class="ds-247420" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Freddie</title>
<link rel="stylesheet" href="https://unpkg.com/anentrypoint-design@latest/dist/247420.css">
<script type="importmap">
{ "imports": { "anentrypoint-design": "https://unpkg.com/anentrypoint-design@latest/dist/247420.js" } }
</script>
<style>
.page-body h1 { margin-top: 0; }
.page-body h2 { margin-top: 32px; }
.page-body h3 { margin-top: 24px; }
.page-body pre { margin: 12px 0; }
</style>
</head>
<body>
<div id="app"></div>
<script type="module">
import { mount, components as C } from 'anentrypoint-design';
const navItems = ${JSON.stringify(NAV.map(n => [n.label, n.href]))};
const pageSlug = '${slug}';
const pageTitle = '${title}';
const pageBody = \`${bodyHtml}\`;

mount(document.getElementById('app'), () => C.AppShell({
  topbar: C.Topbar({ brand: 'Freddie', items: navItems }),
  crumb: C.Crumb({ leaf: pageTitle }),
  main: C.Section({
    id: 'main',
    children: [
      C.Panel({
        children: [
          C.h(null, { innerHTML: pageBody, className: 'page-body' })
        ]
      })
    ]
  }),
  status: C.Status({ left: ['main'], right: ['live'] })
}));
</script>
</body>
</html>`
            outputs.push({ path, html })
        }
        return outputs
    },
}

