// Gemini upstream connectivity lives in acptoapi /v1beta/models/<model>:generateContent.
import { getAcptoapiUrl } from './acptoapi-bridge.js'
import { adaptToolForGemini, adaptMessagesForGemini } from './gemini_schema.js'

export async function chat({ messages, model = 'gemini-2.5-flash', tools = [] } = {}) {
    const acptoapiUrl = getAcptoapiUrl()
    if (!acptoapiUrl) throw new Error('FREDDIE_LLM_URL must be set for this adapter (acptoapi is in-process only otherwise)')
    const base = acptoapiUrl.replace(/\/v1\/?$/, '')
    const url = `${base}/v1beta/models/${model}:generateContent`
    const body = { contents: adaptMessagesForGemini(messages), ...(tools.length ? { tools: [{ function_declarations: tools.map(adaptToolForGemini) }] } : {}) }
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer none' },
        body: JSON.stringify(body),
    })
    return await r.json()
}
export const provider = 'google'
