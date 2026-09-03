import fs from 'node:fs'
import path from 'node:path'
import { getFreddieHome } from '../../../../src/home.js'
export const skillsSyncTool = ({
    name: 'skills_sync',
    toolset: 'core',
    schema: { name: 'skills_sync', description: 'Sync ~/.freddie/skills/ with a remote git repo (clone or pull).', parameters: { type: 'object', properties: { repo: { type: 'string' } }, required: ['repo'] } },
    handler: async ({ repo }) => {
        if (!repo || typeof repo !== 'string') {
            return { exitCode: 1, stderr: 'repo argument must be a non-empty string', stdout: '' }
        }
        if (repo.startsWith('-')) {
            return { exitCode: 1, stderr: 'repo argument cannot start with a dash (git CLI flag injection)', stdout: '' }
        }
        if (!repo.startsWith('https://') && !repo.startsWith('git@')) {
            return { exitCode: 1, stderr: 'repo must start with https:// or git@ (only HTTP and SSH URLs supported)', stdout: '' }
        }
        const dir = path.join(getFreddieHome(), 'skills')
        fs.mkdirSync(dir, { recursive: true })
        const { spawnSync } = await import('node:child_process')
        const exists = fs.existsSync(path.join(dir, '.git'))
        const cmd = exists ? ['git', '-C', dir, 'pull'] : ['git', 'clone', '--', repo, dir]
        const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8' })
        return { exitCode: r.status, stdout: r.stdout, stderr: r.stderr }
    },
})
