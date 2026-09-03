import fs from 'node:fs'
import path from 'node:path'

// The caller already supplied the path (as given, relative or absolute) in
// the request -- echoing it back (resolved or otherwise), or wrapping the
// content in a {total, content} object, is pure ceremony for a normal
// successful read. The raw file text (with line numbers) IS the answer; a
// genuine not-found error is the one case that still needs to name the
// resolved path, since that's the only way to tell the caller which
// candidate location was actually missing.
function readOne(p, offset, limit, ctx) {
    const resolved = ctx.cwd && !path.isAbsolute(p) ? path.join(ctx.cwd, p) : p
    if (!fs.existsSync(resolved)) return `error: not found: ${resolved}`
    const lines = fs.readFileSync(resolved, 'utf8').split('\n')
    const slice = lines.slice(offset, offset + limit)
    return slice.map((l, i) => `${(offset + i + 1).toString().padStart(6)}\t${l}`).join('\n')
}

// Multi-file headers exist only to tell entries apart -- the shortest
// unambiguous label is the cwd-relative form, regardless of whether the
// caller happened to pass an absolute or relative path for that entry.
function displayLabel(p, ctx) {
    if (ctx.cwd && path.isAbsolute(p)) return path.relative(ctx.cwd, p)
    return p
}

export const readTool = ({
    name: 'read',
    toolset: 'core',
    schema: {
        name: 'read',
        description: 'Read one or more files from disk. Returns raw file content with line numbers. Pass a single path string, or an array of path strings to read multiple files in one call (each file\'s content separated by a header line naming the path it came from, as given).',
        parameters: {
            type: 'object',
            properties: {
                path: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: 'A single file path, or an array of file paths' },
                offset: { type: 'number', default: 0 },
                limit: { type: 'number', default: 2000 },
            },
            required: ['path'],
        },
    },
    handler: async ({ path: p, offset = 0, limit = 2000 }, ctx = {}) => {
        // A one-element array has nothing to disambiguate FROM -- the
        // "--- path ---" header only earns its keep once there's more than
        // one file's content to tell apart in the same response.
        if (Array.isArray(p) && p.length > 1) {
            return p.map(one => `--- ${displayLabel(one, ctx)} ---\n${readOne(one, offset, limit, ctx)}`).join('\n\n')
        }
        return readOne(Array.isArray(p) ? p[0] : p, offset, limit, ctx)
    },
})
