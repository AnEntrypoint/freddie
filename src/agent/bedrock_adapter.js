import { resolveKey } from './credential_sources.js'
const REGION = () => process.env.AWS_REGION || 'us-east-1'
export async function chat({ messages, model = 'anthropic.claude-sonnet-4-v1:0', tools = [] } = {}) {
    const id = (await resolveKey('aws')).value || process.env.AWS_ACCESS_KEY_ID
    if (!id) throw new Error('AWS_ACCESS_KEY_ID required for bedrock')
    const url = 'https://bedrock-runtime.' + REGION() + '.amazonaws.com/model/' + encodeURIComponent(model) + '/invoke'
    const body = JSON.stringify({ anthropic_version: 'bedrock-2023-05-31', max_tokens: 4096, messages, ...(tools.length ? { tools } : {}) })
    const r = await fetch(url, { method: 'POST', headers: { authorization: 'AWS4-HMAC-SHA256 ' + (process.env.AWS_SESSION_TOKEN || ''), 'content-type': 'application/json' }, body })
    return await r.json()
}
export const provider = 'bedrock'
