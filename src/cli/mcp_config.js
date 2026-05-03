import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'
function file() { return path.join(getFreddieHome(), 'mcp.json') }
export function loadMcpConfig() { try { return JSON.parse(fs.readFileSync(file(), 'utf8')) } catch { return { servers: {} } } }
export function saveMcpConfig(cfg) { fs.writeFileSync(file(), JSON.stringify(cfg, null, 2), 'utf8') }
export function addServer(name, { command, args = [], env = {} }) { const c = loadMcpConfig(); c.servers[name] = { command, args, env }; saveMcpConfig(c); return c.servers[name] }
export function removeServer(name) { const c = loadMcpConfig(); delete c.servers[name]; saveMcpConfig(c); return name }
export function listServers() { return Object.entries(loadMcpConfig().servers).map(([n, s]) => ({ name: n, ...s })) }
