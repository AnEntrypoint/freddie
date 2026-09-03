// memory tool — the explicit manual surface over freddie's primary learning store, gm rs-learn.
// add -> memorize (semantic embed), search -> recall (vector top-k), list -> broad recall,
// forget -> prune by key. All routed in-process through src/learn/gm-learn.js; no local SQLite.
import { memorize, recall, prune, projectNamespace } from '../../../src/learn/gm-learn.js'

// Namespace is always derived from the active project, never model-supplied: gm.db is a
// single shared libsql file keyed by process.cwd() (not freddie's own per-project
// FREDDIE_HOME registry), so a caller-supplied namespace string would let any turn read
// or write into an arbitrary namespace inside that shared file with zero validation --
// the namespace column is the ONLY isolation boundary the store has. Both system-driven
// callers (autoRecall in machine.js, autoLearnTurn in turn_trajectory.js) already derive
// namespace exclusively via projectNamespace(); this tool now matches that unconditionally.
const ns = () => projectNamespace()

const ACTIONS = {
    add: async (args) => {
        if (!args.content) return { error: 'content required' }
        const key = await memorize(args.content, { namespace: await ns() })
        return key ? { key, stored: 'rs-learn' } : { stored: 'noop', note: 'gm rs-learn unavailable' }
    },
    search: async (args) => {
        const limit = args.limit || 10
        const hits = await recall(args.query || '', { limit, namespace: await ns() })
        return { items: hits.map(h => ({ content: h.text, score: h.score, key: h.key })) }
    },
    list: async (args) => {
        // No native list verb; surface the most relevant memories via a broad recall.
        const hits = await recall(args.query || 'project notes facts decisions', { limit: 50, namespace: await ns() })
        return { items: hits.map(h => ({ content: h.text, score: h.score, key: h.key })) }
    },
    forget: async (args) => {
        if (!args.key) return { error: 'key required to forget (prune is by explicit key, never blind similarity-delete)' }
        return await prune(args.key)
    },
}

export const _tool = ({
    name: 'memory',
    toolset: 'core',
    schema: {
        name: 'memory',
        description: 'Add/search/list/forget long-term memory, backed by gm rs-learn (semantic vector recall). add embeds a fact; search returns score-ranked semantic hits; list surfaces relevant memories; forget prunes by key. Always scoped to the active project\'s own namespace.',
        parameters: { type: 'object', properties: { action: { type: 'string', enum: Object.keys(ACTIONS) }, content: { type: 'string' }, query: { type: 'string' }, key: { type: 'string' }, limit: { type: 'number' } }, required: ['action'] },
    },
    handler: async (args) => {
        const fn = ACTIONS[args.action]
        if (!fn) return { error: 'unknown action: ' + args.action }
        return await fn(args)
    },
})
