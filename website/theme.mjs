// Freddie's flatspace theme — thin delegate over anentrypoint-design's
// renderPageHtml. The SDK owns all 247420 page scaffolding (hero, sections,
// rails, examples, markdown). Freddie only declares its nav and site name.

import { renderPageHtml } from 'anentrypoint-design/page-html'

const NAV = [
    ['Home', '/'],
    ['Plugins', '/plugins/'],
    ['Architecture', '/architecture/'],
    ['CLI', '/cli/'],
    ['Tools', '/tools/'],
    ['Platforms', '/platforms/'],
    ['Skills', '/skills/'],
    ['Development', '/development/'],
]

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
                html: renderPageHtml({
                    title,
                    slug,
                    hero: page.hero,
                    sections: page.sections,
                    examples: page.examples,
                    body: page.body,
                    navItems: NAV,
                    siteName: 'Freddie',
                }),
            })
        }
        return outputs
    },
}
