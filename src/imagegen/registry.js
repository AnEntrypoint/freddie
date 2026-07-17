// Records generation history on top of the provider adapter.
import { generate, listProviders } from './provider.js'

const _generations = []
export async function generateAndRecord(args) { const out = await generate(args); _generations.push({ ts: Date.now(), provider: args.provider || 'openai', prompt: args.prompt, result: out }); return out }
export function listGenerations(limit = 50) { return _generations.slice(-limit).reverse() }
export function clearGenerations() { _generations.length = 0 }
export { listProviders }
