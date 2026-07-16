// `freddie workflow create <template>` — scaffold a resumable xstate workflow
// instance from a known template (approval-workflow.js and siblings under
// src/machines/templates/).
import { startApprovalWorkflow } from '../../src/machines/templates/approval-workflow.js'

const TEMPLATES = {
    approval: {
        description: 'idle -> pending -> approved|rejected',
        start: (key, opts) => startApprovalWorkflow({ key, requestedBy: opts.requestedBy || 'cli', reason: opts.reason || '' }),
    },
}

export default {
    name: 'workflow-templates', surfaces: 'pi',
    register({ pi }) {
        pi.cli.register({
            name: 'workflow',
            description: 'Manage resumable workflow instances (create <template> [key])',
            args: [{ name: 'action', default: 'list' }, { name: 'template' }, { name: 'key' }],
            options: [{ flag: '--requested-by <who>', default: '' }, { flag: '--reason <text>', default: '' }],
            action: async (action, template, key, opts) => {
                if (action === 'list') {
                    for (const [name, t] of Object.entries(TEMPLATES)) console.log(`  ${name.padEnd(20)} ${t.description}`)
                    return
                }
                if (action !== 'create') { console.log(`unknown action '${action}' -- usage: freddie workflow create <template> [key]`); return }
                const t = TEMPLATES[template]
                if (!t) { console.log(`unknown template '${template}'. known: ${Object.keys(TEMPLATES).join(', ')}`); process.exitCode = 1; return }
                const instanceKey = key || `${template}-${Date.now()}`
                const { actor, resumed } = await t.start(instanceKey, opts)
                console.log(`workflow ${resumed ? 'resumed' : 'created'}: kind=${template} key=${instanceKey} state=${JSON.stringify(actor.getSnapshot().value)}`)
            },
        })
    },
}
