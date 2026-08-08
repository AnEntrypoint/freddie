import { loadConfig, saveConfig } from '../../../src/config.js'
import { HookEngine } from '../../../src/agent/hooks_engine.js'
import { getActiveSkin, listBuiltinSkins, setActiveSkin } from '../../../src/skin/engine.js'
import { listAllProfiles, createProfile, deleteProfile, switchProfile } from '../../../src/commands/profile.js'
import { telemetry } from '../../../src/observability/telemetry.js'

export function registerConfigCommands(C) {
    C({ name: 'profile', description: 'Manage profiles', args: [{ name: 'action', default: 'list' }, { name: 'name' }], action: (action, name) => {
        if (action === 'list') { for (const p of listAllProfiles()) console.log(p); return }
        if (action === 'create') { createProfile(name); console.log('created:', name); return }
        if (action === 'delete') { deleteProfile(name); console.log('deleted:', name); return }
        if (action === 'switch') { switchProfile(name); console.log('switched:', name || 'default'); return }
    } })
    C({ name: 'skin', description: 'Switch UI skin', args: [{ name: 'name' }], action: (name) => {
        if (!name) { console.log('active:', getActiveSkin().name); console.log('available:', listBuiltinSkins().join(', ')); return }
        setActiveSkin(name); console.log('switched to:', name)
    } })

    // --- Hook configuration: `freddie config hooks [list|add|rm]` --------------
    C({ name: 'config', description: 'Manage configuration (hooks list|add <hook> <matcher> <command>|rm <hook> <index>)', args: [{ name: 'section', default: 'hooks' }, { name: 'action', default: 'list' }, { name: 'a1' }, { name: 'a2' }, { name: 'a3' }], action: (section, action, a1, a2, a3) => {
        if (section !== 'hooks') { console.error('usage: freddie config hooks [list|add <hook> <matcher> <command>|rm <hook> <index>]'); process.exit(1) }
        const cfg = loadConfig()
        const valid = HookEngine.KIMI_HOOK_NAMES
        if (action === 'list') {
            let any = false
            for (const name of valid) {
                const entries = cfg.hooks?.[name] || []
                if (!entries.length) continue
                any = true
                console.log(`\n[${name}]`)
                for (let i = 0; i < entries.length; i++) {
                    const h = entries[i]
                    console.log(`  ${i}. matcher: ${h.matcher || '(none)'}`)
                    console.log(`     command: ${h.command}`)
                    console.log(`     timeout: ${h.timeout || 30}s`)
                }
            }
            if (!any) console.log('(no hooks configured — add one with `freddie config hooks add <hook> <matcher> <command>`)')
            console.log(`\nvalid hook names: ${valid.join(', ')}`)
            return
        }
        if (action === 'add') {
            if (!a1 || !a2 || !a3) { console.error('usage: freddie config hooks add <hook> <matcher> <command>'); process.exit(1) }
            if (!valid.includes(a1)) { console.error(`unknown hook: ${a1}\nvalid: ${valid.join(', ')}`); process.exit(1) }
            const timeout = 30
            if (!cfg.hooks) cfg.hooks = {}
            if (!cfg.hooks[a1]) cfg.hooks[a1] = []
            cfg.hooks[a1].push({ matcher: a2, command: a3, timeout })
            saveConfig(cfg)
            console.log(`added hook to ${a1}: matcher=${a2} command=${a3}`)
            return
        }
        if (action === 'rm') {
            if (!a1 || a2 === undefined) { console.error('usage: freddie config hooks rm <hook> <index>'); process.exit(1) }
            const idx = Number(a2)
            if (!valid.includes(a1)) { console.error(`unknown hook: ${a1}\nvalid: ${valid.join(', ')}`); process.exit(1) }
            const entries = cfg.hooks?.[a1]
            if (!entries || !entries[idx]) { console.error(`no hook at index ${idx} for ${a1}`); process.exit(1) }
            const removed = entries.splice(idx, 1)[0]
            saveConfig(cfg)
            console.log(`removed hook from ${a1}: ${removed.command}`)
            return
        }
        console.error('usage: freddie config hooks [list|add <hook> <matcher> <command>|rm <hook> <index>]'); process.exit(1)
    } })

    // --- Telemetry: `freddie telemetry status|enable|disable|flush` ----------
    C({ name: 'telemetry', description: 'Manage telemetry / event tracking (status|enable|disable|flush)', args: [{ name: 'action', default: 'status' }], action: async (action) => {
        if (action === 'status') {
            const cfg = loadConfig()
            const enabled = cfg.telemetry?.enabled || false
            const endpoint = cfg.telemetry?.endpoint || null
            console.log(`telemetry: ${enabled ? 'enabled' : 'disabled'}`)
            if (endpoint) console.log(`endpoint: ${endpoint}`)
            console.log(`buffer: ${telemetry._buffer?.length || 0} pending events`)
            return
        }
        if (action === 'enable') {
            const cfg = loadConfig()
            if (!cfg.telemetry) cfg.telemetry = {}
            cfg.telemetry.enabled = true
            saveConfig(cfg)
            console.log('telemetry enabled (set `telemetry.endpoint` in config to send to a remote endpoint)')
            return
        }
        if (action === 'disable') {
            const cfg = loadConfig()
            if (!cfg.telemetry) cfg.telemetry = {}
            cfg.telemetry.enabled = false
            saveConfig(cfg)
            console.log('telemetry disabled')
            return
        }
        if (action === 'flush') {
            await telemetry.flush()
            console.log('telemetry flushed')
            return
        }
        console.error('usage: freddie telemetry [status|enable|disable|flush]'); process.exit(1)
    } })
}
