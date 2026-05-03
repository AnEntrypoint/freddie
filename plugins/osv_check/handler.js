export const _tool = ({
    name: 'osv_check',
    toolset: 'core',
    schema: { name: 'osv_check', description: 'Query osv.dev for known vulnerabilities. Pass either {package, version, ecosystem} or {commit_sha, repo}.', parameters: { type: 'object', properties: { package: { type: 'string' }, version: { type: 'string' }, ecosystem: { type: 'string' }, commit_sha: { type: 'string' } } } },
    handler: async (args) => {
        const body = args.commit_sha ? { commit: args.commit_sha } : { package: { name: args.package, ecosystem: args.ecosystem || 'npm' }, version: args.version }
        const r = await fetch('https://api.osv.dev/v1/query', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        return await r.json()
    },
})
