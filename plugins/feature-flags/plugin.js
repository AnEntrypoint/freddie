import { listFlags, enableFlag, disableFlag, rolloutFlag } from '../../src/flags.js'

export default {
    name: 'feature-flags', surfaces: 'pi',
    register({ pi }) {
        pi.cli.register({
            name: 'flag',
            description: 'Manage per-project feature flags (list|enable <name>|disable <name>|rollout <name> <pct>)',
            args: [{ name: 'action', default: 'list' }, { name: 'name' }, { name: 'pct' }],
            action: (action, name, pct) => {
                if (action === 'list') {
                    const flags = listFlags()
                    if (!flags.length) { console.log('no flags declared -- every undeclared flag defaults to enabled'); return }
                    for (const f of flags) console.log(`  ${f.name.padEnd(24)} ${f.effective ? 'on ' : 'off'}  ${f.rollout_pct != null ? `(rollout ${f.rollout_pct}%)` : ''}`)
                    return
                }
                if (action === 'enable') { if (!name) { console.log('usage: freddie flag enable <name>'); return }; enableFlag(name); console.log(`enabled: ${name}`); return }
                if (action === 'disable') { if (!name) { console.log('usage: freddie flag disable <name>'); return }; disableFlag(name); console.log(`disabled: ${name}`); return }
                if (action === 'rollout') {
                    if (!name || pct === undefined) { console.log('usage: freddie flag rollout <name> <pct>'); return }
                    const n = Number(pct)
                    if (!Number.isFinite(n) || n < 0 || n > 100) { console.log(`invalid pct '${pct}' -- must be 0-100`); process.exitCode = 1; return }
                    rolloutFlag(name, n)
                    console.log(`rollout set: ${name} -> ${n}%`)
                    return
                }
                console.log(`unknown action '${action}' -- usage: freddie flag list|enable <name>|disable <name>|rollout <name> <pct>`)
            },
        })
    },
}
