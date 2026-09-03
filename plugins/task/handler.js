import { getTask, listTasks, listAllTasks, stopTask, getTaskOutput, awaitTask, cleanCompleted, reconcileTasks, cleanupStaleTasks } from './registry.js'

export const _task = {
    name: 'task',
    toolset: 'core',
    schema: {
        name: 'task',
        description:
            'List or inspect background tasks. Without a task_id, returns all active background tasks. With a task_id, returns full details of that specific task. Use subcommand "list" with all=true to show all tasks including completed, "clean" to remove completed/failed tasks, "reconcile" to detect stale tasks, or "cleanup" to remove old terminal tasks.',
        parameters: {
            type: 'object',
            properties: {
                subcommand: {
                    type: 'string',
                    enum: ['list', 'list_all', 'clean', 'reconcile', 'cleanup'],
                    description: 'Explicit operation: "list" for active tasks, "list_all" for all including completed, "clean" to remove completed/failed, "reconcile" to detect stale tasks, "cleanup" to remove old terminal tasks.',
                },
                task_id: {
                    type: 'string',
                    description: 'Task ID to inspect. When provided, returns full details for that task.',
                },
            },
        },
    },
    handler: async ({ subcommand, task_id }) => {
        if (task_id) {
            const t = getTask(task_id)
            if (!t) return { error: `unknown task_id: ${task_id}` }
            return {
                id: t.id,
                status: t.status,
                started: t.started,
                stopped: t.stopped || null,
                description: t.description || null,
                exit_code: t.exitCode ?? null,
                output_preview: (t.output || '').slice(0, 500) || null,
            }
        }
        if (subcommand === 'list_all') {
            return { tasks: listAllTasks() }
        }
        if (subcommand === 'clean') {
            await cleanCompleted()
            return { cleaned: true }
        }
        if (subcommand === 'reconcile') {
            return reconcileTasks()
        }
        if (subcommand === 'cleanup') {
            return cleanupStaleTasks()
        }
        // Default: list active tasks
        return { tasks: listTasks() }
    },
}

export const _taskOutput = {
    name: 'task_output',
    toolset: 'core',
    schema: {
        name: 'task_output',
        description:
            'Retrieve the output of a running or completed background task. Returns a snapshot of current stdout, stderr, exit code, and status. Set block=true to wait up to timeout seconds for the task to complete before returning.',
        parameters: {
            type: 'object',
            properties: {
                task_id: { type: 'string', description: 'Task ID whose output to retrieve.' },
                block: {
                    type: 'boolean',
                    default: false,
                    description: 'If true, wait up to timeout seconds for the task to complete.',
                },
                timeout: {
                    type: 'number',
                    default: 30,
                    description: 'Maximum seconds to wait when block=true.',
                },
            },
            required: ['task_id'],
        },
    },
    handler: async ({ task_id, block = false, timeout = 30 }) => {
        if (block) {
            return await awaitTask(task_id, Math.floor(timeout * 1000))
        }
        return getTaskOutput(task_id)
    },
}

export const _taskStop = {
    name: 'task_stop',
    toolset: 'core',
    schema: {
        name: 'task_stop',
        description:
            'Stop a running background task. Kills the underlying process and marks the task as stopped.',
        parameters: {
            type: 'object',
            properties: {
                task_id: { type: 'string', description: 'Task ID to stop.' },
                reason: { type: 'string', description: 'Optional reason for stopping.' },
            },
            required: ['task_id'],
        },
    },
    handler: async ({ task_id, reason }) => {
        const result = stopTask(task_id)
        if (reason && !result.error) {
            result.reason = reason
        }
        return result
    },
}