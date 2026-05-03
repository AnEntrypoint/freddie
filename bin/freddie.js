#!/usr/bin/env node
import { Command } from 'commander'
import { bootHost } from '../src/host/index.js'

const program = new Command()
program.name('freddie').version('0.1.0').description('Freddie — open JS agent harness, plugin-driven')

const host = await bootHost()
for (const def of host.pi.cli.list()) {
    const cmd = program.command(def.name).description(def.description || '')
    for (const a of def.args || []) {
        const tag = a.required ? `<${a.name}>` : `[${a.name}]`
        cmd.argument(tag, a.description || '', a.default)
    }
    for (const o of def.options || []) cmd.option(o.flag, o.description || '', o.default)
    cmd.action(def.action)
}

program.parseAsync(process.argv).catch(e => { console.error(e); process.exit(1) })
