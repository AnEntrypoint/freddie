import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'
function file() { return path.join(getFreddieHome(), 'hooks.json') }
export function loadHooks() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')) } catch { return { pre_command: [], post_command: [], pre_tool: [], post_tool: [] } } }
export function saveHooks(h) { fs.writeFileSync(file(), JSON.stringify(h, null, 2), 'utf8') }
export function addHook(stage, command) { const h = loadHooks(); (h[stage] = h[stage] || []).push(command); saveHooks(h); return h }
export function removeHook(stage, idx) { const h = loadHooks(); h[stage] = (h[stage] || []).filter((_, i) => i !== idx); saveHooks(h); return h }
export function listHooks() { return loadHooks() }
