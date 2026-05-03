import { registry } from './registry.js'
import { detectSecrets } from '../agent/redact.js'

const DANGEROUS = [/rm\s+-rf\s+\//, /:\(\)\s*\{\s*:\|:&\s*\};:/, /chmod\s+-R\s+777/]

registry.register({
    name: 'skills_guard',
    toolset: 'core',
    schema: { name: 'skills_guard', description: 'Inspect skill body for dangerous patterns (rm -rf /, fork bombs, secrets) before injection.', parameters: { type: 'object', properties: { body: { type: 'string' } }, required: ['body'] } },
    handler: async ({ body }) => {
        const issues = []
        for (const re of DANGEROUS) if (re.test(body)) issues.push({ kind: 'dangerous-cmd', pattern: re.source })
        const secrets = detectSecrets(body)
        if (secrets.length) issues.push({ kind: 'secret', count: secrets.length })
        return { safe: issues.length === 0, issues }
    },
})
