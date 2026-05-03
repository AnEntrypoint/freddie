export const bootHook = async (msg) => {
    if (typeof msg?.text !== 'string') return msg
    if (msg.text.startsWith('/boot')) return { ...msg, text: msg.text.replace(/^\/boot\s*/, '').trim() || 'hello' }
    return msg
}
