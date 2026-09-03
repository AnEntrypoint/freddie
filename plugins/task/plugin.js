import { _task, _taskOutput, _taskStop } from './handler.js'
import { listTasks, listAllTasks, cleanCompleted, restoreTasks, reconcileTasks, cleanupStaleTasks, startPeriodicReconciliation } from './registry.js'

export default {
    name: 'task',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(_task)
        pi.tools.register(_taskOutput)
        pi.tools.register(_taskStop)

        // CLI subcommands: `freddie task list [--all]`, `freddie task clean`,
        // `freddie task reconcile`, `freddie task cleanup`
        pi.cli.register({
            name: 'task',
            description: 'List, clean, reconcile, or cleanup background tasks',
            args: [
                { name: 'action', default: 'list', description: 'list | clean | reconcile | cleanup' },
            ],
            options: [
                { flag: '--all', description: 'Show all tasks including completed', default: false },
            ],
            action: async (action, opts) => {
                if (action === 'clean') {
                    await cleanCompleted()
                    console.log('cleaned completed/failed/stopped tasks')
                    return
                }
                if (action === 'reconcile') {
                    const result = reconcileTasks()
                    console.log(`reconciled: ${result.reconciled} (${result.lost} lost, ${result.timed_out} timed out)`)
                    return
                }
                if (action === 'cleanup') {
                    const result = cleanupStaleTasks()
                    console.log(`cleaned ${result.cleaned} stale task(s)`)
                    return
                }
                // list (default)
                const tasks = opts.all ? listAllTasks() : listTasks()
                if (!tasks.length) { console.log('(no tasks)'); return }
                for (const t of tasks) {
                    const status = t.status.padEnd(10)
                    const age = t.started ? new Date(t.started).toISOString().slice(11, 19) : '?'
                    const desc = (t.description || '').slice(0, 60)
                    console.log(`${t.id.slice(0, 8)}\t${status}\t${age}\t${desc}`)
                }
            },
        })

        // Restore persisted tasks from the JSONL store on load.
        // Fire-and-forget — failures are silent (tasks degrade to in-memory).
        restoreTasks().catch(() => {})

        // Start periodic reconciliation (every 5 minutes) to detect stale tasks.
        startPeriodicReconciliation()
    },
}