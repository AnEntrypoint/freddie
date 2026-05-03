export const _tool0 = ({
    name: 'web_fetch',
    toolset: 'browse',
    schema: { name: 'web_fetch', description: 'Fetch a URL and return text/json/headers.', parameters: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string', default: 'GET' }, headers: {}, body: { type: 'string' }, parse: { type: 'string', enum: ['text', 'json'] } }, required: ['url'] } },
    handler: async ({ url, method = 'GET', headers = {}, body, parse = 'text' }) => {
        const r = await fetch(url, { method, headers, body })
        const ct = r.headers.get('content-type')
        const out = parse === 'json' ? await r.json().catch(() => null) : await r.text()
        return { status: r.status, contentType: ct, body: out }
    },
})
export const _tool1 = ({
    name: 'web_extract',
    toolset: 'browse',
    schema: { name: 'web_extract', description: 'Strip tags from HTML to plain text.', parameters: { type: 'object', properties: { html: { type: 'string' } }, required: ['html'] } },
    handler: async ({ html }) => ({ text: String(html).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }),
})
