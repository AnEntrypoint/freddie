import { listDebug, snapshot, snapshotAll } from '../observability/debug.js'
let _verbose = Boolean(process.env.FREDDIE_DEBUG)
export function isVerbose() { return _verbose }
export function setVerbose(v) { _verbose = Boolean(v); process.env.FREDDIE_DEBUG = v ? '1' : '' }
export function dprint(...args) { if (_verbose) console.error('[debug]', ...args) }
export function dumpDebug(name) { return name ? snapshot(name) : { subsystems: listDebug(), all: snapshotAll() } }
