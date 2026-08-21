import { killTree } from '../../../src/tools/kill_tree.js'

const _processes = new Map()
export function registerProcess(id, child, meta = {}) { _processes.set(id, { id, pid: child.pid, started: Date.now(), ...meta }); child.on?.('exit', () => _processes.delete(id)) }
export function listProcesses() { return [..._processes.values()] }
// killTree, not bare process.kill(pid,'SIGTERM'): on Windows the tracked pid
// is frequently a shell (cmd.exe) that spawned the REAL work as a
// grandchild -- a plain SIGTERM-equivalent to the shell alone does not
// propagate to it (same defect class already fixed in kill_tree.js's own
// header comment, bash/handler.js, and environments/local.js above).
export function killProcess(id) { const p = _processes.get(id); if (p) killTree(p.pid); return p ? { killed: id } : { error: 'unknown id' } }

export const _tool = ({
    name: 'process_registry',
    toolset: 'core',
    schema: { name: 'process_registry', description: 'List/kill spawned background processes tracked by freddie.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'kill'] }, id: { type: 'string' } }, required: ['action'] } },
    handler: async ({ action, id }) => {
        if (action === 'list') return { processes: listProcesses() }
        if (action === 'kill') return killProcess(id)
        return { error: 'unknown action' }
    },
})
