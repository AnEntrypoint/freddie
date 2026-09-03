// `freddie memory review <query>` — the one real remaining privacy-control
// gap in gm rs-learn (per AGENTS.md's Learning section): prune() only
// supports explicit key-based deletion, with no bulk "what does freddie
// remember about X" surface to find those keys in the first place. This
// bridges recall() (search) to prune() (delete) for a human-driven review.
import { recall, prune } from '../../src/learn/gm-learn.js'

export default {
    name: 'memory-review', surfaces: 'pi',
    register({ pi }) {
        pi.cli.register({
            name: 'memory',
            description: 'Review what freddie remembers about a topic, for user-driven privacy deletion (review <query> [--limit=N] [--forget])',
            args: [{ name: 'action', default: 'review' }, { name: 'query' }],
            options: [{ flag: '--limit <n>', default: '10' }, { flag: '--forget', default: false }],
            action: async (action, query, opts) => {
                if (action !== 'review') { console.log(`unknown action '${action}' -- usage: freddie memory review <query>`); return }
                if (!query) { console.log('usage: freddie memory review <query> [--limit=N] [--forget]'); process.exitCode = 1; return }
                const limit = Number(opts.limit) || 10
                const hits = await recall(query, { limit })
                if (!hits.length) { console.log(`no memories found matching: ${query}`); return }
                console.log(`${hits.length} memor${hits.length === 1 ? 'y' : 'ies'} matching "${query}":\n`)
                for (const h of hits) console.log(`  [${h.score.toFixed(3)}] ${h.key || '(no key)'}  ${h.text.slice(0, 120)}${h.text.length > 120 ? '...' : ''}`)
                if (opts.forget) {
                    const keys = hits.map((h) => h.key).filter(Boolean)
                    if (!keys.length) { console.log('\nno keyed memories to forget (unkeyed hits cannot be pruned by key)'); return }
                    await prune(keys)
                    console.log(`\nforgot ${keys.length} matching memor${keys.length === 1 ? 'y' : 'ies'}`)
                } else {
                    console.log('\n(pass --forget to delete every matching memory shown above)')
                }
            },
        })
    },
}
