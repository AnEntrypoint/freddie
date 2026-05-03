const ROUTERS = {
    anthropic: (parts) => parts.map(p => p.type === 'image_url' ? { type: 'image', source: { type: 'base64', media_type: p.image_url?.media_type || 'image/png', data: p.image_url?.url?.split(',').pop() || '' } } : p),
    openai: (parts) => parts.map(p => p.type === 'image' ? { type: 'image_url', image_url: { url: typeof p.source === 'string' ? p.source : ('data:' + (p.source?.media_type || 'image/png') + ';base64,' + (p.source?.data || '')) } } : p),
    google: (parts) => parts.map(p => p.type === 'image_url' ? { inline_data: { mime_type: p.image_url?.media_type || 'image/png', data: p.image_url?.url?.split(',').pop() || '' } } : p),
}
export function routeImagesNative(messages, provider = 'anthropic') {
    const router = ROUTERS[provider] || ((p) => p)
    return messages.map(m => {
        if (!Array.isArray(m.content)) return m
        return { ...m, content: router(m.content) }
    })
}
export function listImageProviders() { return Object.keys(ROUTERS) }
