import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../home.js'
import { registry as toolRegistry } from '../tools/registry.js'
import { logger } from '../observability/log.js'

const log = logger('plugins')

const HOOK_NAMES = ['preToolCall', 'postToolCall', 'preLlmCall', 'postLlmCall', 'onSessionStart', 'onSessionEnd']

export class PluginManager {
    constructor() {
        this.plugins = []
        this.hooks = Object.fromEntries(HOOK_NAMES.map(n => [n, []]))
        this.cliCommands = []
    }

    async discoverPlugins(extraDirs = []) {
        const dirs = [path.join(getFreddieHome(), 'plugins'), path.join(process.cwd(), '.freddie', 'plugins'), ...extraDirs]
        for (const d of dirs) {
            if (!fs.existsSync(d)) continue
            for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue
                const pkg = path.join(d, entry.name, 'package.json')
                if (!fs.existsSync(pkg)) continue
                try { await this._loadPlugin(path.join(d, entry.name)) } catch (e) { log.error('plugin load failed', { name: entry.name, err: String(e) }) }
            }
        }
        return this.plugins.length
    }

    async _loadPlugin(dir) {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
        const main = path.join(dir, pkg.main || 'index.js')
        const mod = await import(`file://${main.replace(/\\/g, '/')}`)
        const ctx = this._ctx()
        if (typeof mod.register === 'function') await mod.register(ctx)
        this.plugins.push({ name: pkg.name, dir, main })
        log.info('plugin loaded', { name: pkg.name })
    }

    register(plugin) {
        const ctx = this._ctx()
        plugin.register?.(ctx)
        this.plugins.push({ name: plugin.name || 'inline', ...plugin })
    }

    _ctx() {
        const self = this
        return {
            registerHook: (name, fn) => { if (!HOOK_NAMES.includes(name)) throw new Error(`unknown hook: ${name}`); self.hooks[name].push(fn) },
            registerTool: (spec) => toolRegistry.register(spec),
            registerCliCommand: (def) => self.cliCommands.push(def),
        }
    }

    async invoke(hook, payload) {
        let cur = payload
        for (const fn of this.hooks[hook] || []) {
            try { cur = (await fn(cur)) || cur } catch (e) { log.error('hook failed', { hook, err: String(e) }) }
        }
        return cur
    }
}

export const pluginManager = new PluginManager()
