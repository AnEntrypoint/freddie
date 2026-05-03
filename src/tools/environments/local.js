import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export class LocalEnvironment {
    constructor(opts = {}) { this.cwd = opts.cwd || process.cwd(); this.name = 'local' }
    async run(cmd, { timeoutMs = 60000 } = {}) {
        return new Promise(resolve => {
            const sh = process.platform === 'win32' ? 'cmd' : 'sh'
            const flag = process.platform === 'win32' ? '/c' : '-c'
            const child = spawn(sh, [flag, cmd], { cwd: this.cwd, env: process.env })
            let stdout = '', stderr = ''
            const t = setTimeout(() => { try { child.kill('SIGKILL') } catch {} resolve({ exitCode: -1, stdout, stderr: stderr + '\n[timeout]' }) }, timeoutMs)
            child.stdout?.on('data', d => stdout += d.toString())
            child.stderr?.on('data', d => stderr += d.toString())
            child.on('close', code => { clearTimeout(t); resolve({ exitCode: code, stdout, stderr }) })
            child.on('error', e => { clearTimeout(t); resolve({ exitCode: -1, stdout, stderr: stderr + '\n' + e.message }) })
        })
    }
    async put(localPath, remotePath) {
        fs.mkdirSync(path.dirname(remotePath), { recursive: true })
        fs.copyFileSync(localPath, remotePath)
        return { copied: remotePath }
    }
    async get(remotePath, localPath) {
        fs.mkdirSync(path.dirname(localPath), { recursive: true })
        fs.copyFileSync(remotePath, localPath)
        return { copied: localPath }
    }
    async shutdown() {}
}
