// Freddie's flatspace theme — thin delegate over anentrypoint-design's
// renderPageHtml. The SDK owns all 247420 page scaffolding (hero, sections,
// rails, examples, markdown). Freddie only declares its nav and site name.

import { renderPageHtml } from 'anentrypoint-design/page-html'

// Pin the design SDK CSS to the installed version instead of the SDK's
// `@latest` default, so a future upstream publish can't silently reflow the
// docs. Mirror the version freddie actually has in node_modules.
// NOTE: page-html's JS importmap (the 247420.js bundle) is hardcoded to
// `@latest` inside the SDK and exposes no override hook — only the CSS href is
// reconcilable here. Fully pinning/self-hosting the JS is an SDK concern.
const DESIGN_VERSION = '0.0.169'
const CSS_HREF = `https://unpkg.com/anentrypoint-design@${DESIGN_VERSION}/dist/247420.css`

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
                    basePath: '/freddie/',
                    cssHref: CSS_HREF,
                }),
            })
        }
        return outputs
    },
}
