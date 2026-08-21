#!/usr/bin/env node
import { Command } from 'commander'
import { bootHost } from '../src/host/index.js'

const program = new Command()
program.name('freddie').version('0.1.0').description('Freddie — open JS agent harness, plugin-driven')

// --approve/-a and --no-approve override the project-local plugin trust
// gate (see src/host/plugin-trust.js) for this invocation, mirroring pi's own
// CLI flags for the same concern. Registered as real commander global options
// (not hand-parsed off argv) so commander itself recognizes and strips them
// before dispatching to a subcommand action, and so `--help` documents them.
// bootHost() must still run before subcommands are registered (host.pi.cli.list()
// depends on it), so parse just these two options eagerly via a throwaway
// Command clone rather than the full program -- the full parseAsync() below
// still runs against the real argv afterward for normal subcommand dispatch.
// configureOutput swallowing both streams is required, not just exitOverride:
// exitOverride() alone only replaces commander's process.exit() call with a
// thrown CommanderError, which the catch below discards -- but commander
// writes --help/--version output to stdout as a side effect BEFORE it exits,
// so without this the throwaway _preParse also prints its own truncated help
// (only the two approve flags, none of the real subcommands) ahead of the
// real program's correct help further down, doubling every `freddie --help`.
const _preParse = new Command()
    .option('-a, --approve', 'trust this project\'s local plugins (.freddie/plugins/) without prompting')
    .option('--no-approve', 'do not trust this project\'s local plugins without prompting')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .configureOutput({ writeOut: () => {}, writeErr: () => {} })
    .exitOverride()
try { _preParse.parse(process.argv) } catch { /* --help/--version etc in this pre-parse are handled by the real parse below */ }
const _preOpts = _preParse.opts()
const _approveCwdPlugins = ('approve' in _preOpts) ? _preOpts.approve : null

program
    .option('-a, --approve', 'trust this project\'s local plugins (.freddie/plugins/) without prompting')
    .option('--no-approve', 'do not trust this project\'s local plugins without prompting')

const host = await bootHost([], { approveCwdPlugins: _approveCwdPlugins })
for (const def of host.pi.cli.list()) {
    const cmd = program.command(def.name).description(def.description || '')
    for (const a of def.args || []) {
        const tag = a.required ? `<${a.name}>` : `[${a.name}]`
        cmd.argument(tag, a.description || '', a.default)
    }
    // requiredOption() enforces the flag at commander's own parse time (a
    // clean "error: required option '--x <x>' not specified" before the
    // action ever runs) -- plain option() silently ignores a CommandDef's
    // required:true, letting an action run with the option undefined (e.g.
    // `exec` with no --prompt used to boot the full agent/LLM chain on an
    // undefined prompt and fail deep downstream with an opaque "fetch failed"
    // instead of rejecting immediately at the CLI boundary).
    for (const o of def.options || []) o.required ? cmd.requiredOption(o.flag, o.description || '', o.default) : cmd.option(o.flag, o.description || '', o.default)
    cmd.action(def.action)
}

// Top-level catch for any subcommand action's rejected promise. Expected,
// user-facing failures (unknown provider, non-TTY setup, etc) throw a plain
// Error with an already-actionable message -- printing the raw error object
// dumps its stack trace over that message, which reads as an internal crash
// even when the failure is an ordinary, anticipated validation error. Print
// just the message; opt into the full stack via FREDDIE_DEBUG for diagnosing
// a genuine internal fault.
program.parseAsync(process.argv).catch(e => {
    console.error('error:', e?.message || e)
    if (process.env.FREDDIE_DEBUG) console.error(e?.stack || '')
    process.exit(1)
})
