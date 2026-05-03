import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'

function file() { return path.join(getFreddieHome(), 'tools_config.json') }
export function loadToolsConfig() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')) } catch { return {} } }
export function saveToolsConfig(cfg) { fs.writeFileSync(file(), JSON.stringify(cfg, null, 2), 'utf8') }
export function setToolOverride(toolName, override) {
    const cfg = loadToolsConfig()
    cfg[toolName] = { ...(cfg[toolName] || {}), ...override }
    saveToolsConfig(cfg)
    return cfg[toolName]
}
export function getToolOverride(toolName) { return loadToolsConfig()[toolName] || null }
export function clearToolOverride(toolName) { const cfg = loadToolsConfig(); delete cfg[toolName]; saveToolsConfig(cfg); return true }
