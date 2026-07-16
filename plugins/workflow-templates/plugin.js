// `freddie workflow create <template>` — scaffold a resumable xstate workflow
// instance from a known template (approval-workflow.js and siblings under
// src/machines/templates/).
import { startApprovalWorkflow } from '../../src/machines/templates/approval-workflow.js'
import { startMultiStageReview } from '../../src/machines/templates/multi-stage-review.js'
import { startIncidentResponse } from '../../src/machines/templates/incident-response.js'

const TEMPLATES = {
    approval: {
        description: 'idle -> pending -> approved|rejected',
        start: (key, opts) => startApprovalWorkflow({ key, requestedBy: opts.requestedBy || 'cli', reason: opts.reason || '' }),
    },
    'multi-stage-review': {
        description: 'draft -> reviewN -> ... -> approved|rejected (N configurable via --stages)',
        start: (key, opts) => startMultiStageReview({ key, stageCount: opts.stages ? Number(opts.stages) : 2, submittedBy: opts.requestedBy || 'cli' }),
    },
    'incident-response': {
        description: 'detected -> triaging -> mitigating -> resolved -> postmortem',
        start: (key) => startIncidentResponse({ key }),
    },
}

export default {
    name: 'workflow-templates', surfaces: 'pi',
    register({ pi }) {
        pi.cli.register({
            name: 'workflow',
            description: 'Manage resumable workflow instances (create <template> [key])',
            args: [{ name: 'action', default: 'list' }, { name: 'template' }, { name: 'key' }],
            options: [{ flag: '--requested-by <who>', default: '' }, { flag: '--reason <text>', default: '' }, { flag: '--stages <n>', default: '' }],
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
