export function generateTitle(prompt, { maxWords = 8 } = {}) {
    const text = String(prompt || '').replace(/[\n\r]+/g, ' ').trim()
    if (!text) return 'untitled'
    const words = text.split(/\s+/).slice(0, maxWords)
    let title = words.join(' ')
    if (title.length > 60) title = title.slice(0, 57) + '…'
    return title.charAt(0).toUpperCase() + title.slice(1)
}
export async function llmTitle(messages, { callLLM, model = null } = {}) {
    if (!callLLM) return generateTitle(messages?.[0]?.content || '')
    const out = await callLLM({ model, messages: [{ role: 'user', content: 'Title this conversation in <=8 words. Reply only with the title.\n\n' + JSON.stringify(messages.slice(0, 4)) }] })
    return (out?.content || '').trim().replace(/^["']|["']$/g, '') || generateTitle(messages?.[0]?.content || '')
}
