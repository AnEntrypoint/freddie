import fs from 'node:fs'
import path from 'node:path'

const MAX_DIR_DEPTH = 2
const MAX_FILE_SIZE = 64 * 1024 // 64KB limit for reading files

function listTree(dir, depth = 0, maxDepth = MAX_DIR_DEPTH, ignore = new Set(['node_modules', '.git', 'dist', '.next', '__pycache__', '.venv', 'target', 'build'])) {
    if (depth > maxDepth) return null
    let entries = []
    try {
        const names = fs.readdirSync(dir)
        for (const name of names) {
            if (ignore.has(name) || name.startsWith('.')) continue
            const full = path.join(dir, name)
            let stat
            try { stat = fs.statSync(full) } catch { continue }
            if (stat.isDirectory()) {
                const children = depth < maxDepth ? listTree(full, depth + 1, maxDepth, ignore) : '...'
                entries.push({ name: name + '/', children })
            } else {
                entries.push({ name, size: stat.size })
            }
        }
    } catch { return null }
    // Sort: directories first, then files, alphabetically within each group
    entries.sort((a, b) => {
        const aDir = a.name.endsWith('/') ? 0 : 1
        const bDir = b.name.endsWith('/') ? 0 : 1
        if (aDir !== bDir) return aDir - bDir
        return a.name.localeCompare(b.name)
    })
    return entries
}

function formatTree(entries, prefix = '') {
    if (!entries) return ''
    let out = ''
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i]
        const isLast = i === entries.length - 1
        const branch = isLast ? '└── ' : '├── '
        const next = isLast ? '    ' : '│   '
        out += prefix + branch + e.name + '\n'
        if (Array.isArray(e.children)) {
            out += formatTree(e.children, prefix + next)
        } else if (e.children === '...') {
            out += prefix + next + '...\n'
        }
    }
    return out
}

function safeRead(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null
        const stat = fs.statSync(filePath)
        if (stat.size > MAX_FILE_SIZE) return `[file too large: ${stat.size} bytes, truncated]\n` + fs.readFileSync(filePath, 'utf8').slice(0, MAX_FILE_SIZE)
        return fs.readFileSync(filePath, 'utf8')
    } catch { return null }
}

function safeReadJson(filePath) {
    const raw = safeRead(filePath)
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
}

export const initAgent = {
    name: 'init_agent',
    toolset: 'core',
    schema: {
        name: 'init_agent',
        description: 'Analyze the codebase at the given path (or current working directory) and generate a structured analysis that can be used to write an AGENTS.md file. Returns a directory tree, package.json contents, and any existing AGENTS.md/CLAUDE.md/README.md files.',
        parameters: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Directory to analyze. Defaults to the current working directory.',
                },
                force: {
                    type: 'boolean',
                    default: false,
                    description: 'If true, the analysis will proceed even if an AGENTS.md already exists (it will still be read and included in the output).',
                },
            },
        },
    },
    handler: async (args, ctx = {}) => {
        const targetPath = args.path || ctx.cwd || process.cwd()
        const resolved = path.resolve(targetPath)

        if (!fs.existsSync(resolved)) {
            return { error: `path not found: ${resolved}` }
        }
        if (!fs.statSync(resolved).isDirectory()) {
            return { error: `not a directory: ${resolved}` }
        }

        const existingAgents = safeRead(path.join(resolved, 'AGENTS.md'))
        const existingClaude = safeRead(path.join(resolved, 'CLAUDE.md'))
        const readme = safeRead(path.join(resolved, 'README.md'))
        const pkgJson = safeReadJson(path.join(resolved, 'package.json'))

        if (existingAgents && !args.force) {
            return {
                note: 'AGENTS.md already exists. Use force=true to re-analyze anyway.',
                existingAgentsMd: existingAgents,
                tree: formatTree(listTree(resolved)),
                packageJson: pkgJson,
                readme,
                existingClaudeMd: existingClaude,
            }
        }

        const tree = listTree(resolved)
        const treeText = formatTree(tree)

        // Build a suggested structure for AGENTS.md content
        const suggestedStructure = {
            sections: [
                'Build & Test Commands',
                'Code Style & Conventions',
                'Architecture Overview',
                'Project Structure',
                'Key Dependencies',
                'Environment Variables',
                'Testing Guidelines',
            ],
            note: 'Use the tree, package.json, and existing docs below to populate each section with specific, actionable information.',
        }

        return {
            tree: treeText,
            packageJson: pkgJson ? {
                name: pkgJson.name,
                version: pkgJson.version,
                description: pkgJson.description,
                scripts: pkgJson.scripts,
                dependencies: pkgJson.dependencies,
                devDependencies: pkgJson.devDependencies,
            } : null,
            readme: readme ? readme.slice(0, 4000) : null,
            existingAgentsMd: existingAgents,
            existingClaudeMd: existingClaude,
            suggestedStructure,
        }
    },
}