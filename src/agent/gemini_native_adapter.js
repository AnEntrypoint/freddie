import { resolveKey } from './credential_sources.js'
import { adaptToolForGemini, adaptMessagesForGemini } from './gemini_schema.js'
export async function chat({ messages, model = 'gemini-2.5-flash', tools = [] } = {}) {
    const k = await resolveKey('google')
    if (!k.value) throw new Error('GOOGLE_API_KEY required')
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + k.value
    const body = { contents: adaptMessagesForGemini(messages), ...(tools.length ? { tools: [{ function_declarations: tools.map(adaptToolForGemini) }] } : {}) }
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return await r.json()
}
export const provider = 'google'
