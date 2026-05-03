import { getConfigValue, saveConfigValue } from '../config.js'
export const DEFAULTS = { agent_turn_ms: 60_000, tool_call_ms: 30_000, llm_call_ms: 90_000, batch_item_ms: 60_000, gateway_inbound_ms: 5_000 }
export function getTimeout(key) { return getConfigValue('timeouts.' + key, DEFAULTS[key] ?? 30_000) }
export function setTimeout_(key, ms) { saveConfigValue('timeouts.' + key, Number(ms)); return { key, ms: Number(ms) } }
export function listTimeouts() { return Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, getTimeout(k)])) }
