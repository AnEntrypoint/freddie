import { registry } from './registry.js'

const _processes = new Map()
export function registerProcess(id, child, meta = {}) { _processes.set(id, { id, pid: child.pid, started: Date.now(), ...meta }); child.on?.('exit', () => _processes.delete(id)) }
export function listProcesses() { return [..._processes.values()] }
export function killProcess(id) { const p = _processes.get(id); if (p) try { process.kill(p.pid, 'SIGTERM') } catch {} return p ? { killed: id } : { error: 'unknown id' } }

registry.register({
    name: 'process_registry',
    toolset: 'core',
    schema: { name: 'process_registry', description: 'List/kill spawned background processes tracked by freddie.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'kill'] }, id: { type: 'string' } }, required: ['action'] } },
    handler: async ({ action, id }) => {
        if (action === 'list') return { processes: listProcesses() }
        if (action === 'kill') return killProcess(id)
        return { error: 'unknown action' }
    },
})
