import { spawn } from 'node:child_process'
import { BaseEnvironment } from './base.js'

export class SingularityEnvironment extends BaseEnvironment {
    constructor(opts = {}) {
        super(opts)
        this.name = 'singularity'
        this.image = opts.image || 'docker://ubuntu:22.04'
        this.binary = opts.binary || process.env.SINGULARITY_BIN || 'singularity'
        this.binds = opts.binds || []
        this.cwd = opts.cwd || '/workspace'
    }
    _bindArgs() {
        const args = []
        for (const b of this.binds) args.push('--bind', b)
        return args
    }
    async run(cmd, { timeoutMs = 120000 } = {}) {
        return new Promise(resolve => {
            const args = ['exec', '--pwd', this.cwd, ...this._bindArgs(), this.image, 'sh', '-c', cmd]
            const child = spawn(this.binary, args, { env: process.env })
            let stdout = '', stderr = ''
            const t = setTimeout(() => { try { child.kill('SIGKILL') } catch {} resolve({ exitCode: -1, stdout, stderr: stderr + '\n[timeout]' }) }, timeoutMs)
            child.stdout?.on('data', d => stdout += d.toString())
            child.stderr?.on('data', d => stderr += d.toString())
            child.on('close', code => { clearTimeout(t); resolve({ exitCode: code, stdout, stderr }) })
            child.on('error', e => { clearTimeout(t); resolve({ exitCode: -1, stdout, stderr: stderr + '\n' + e.message }) })
        })
    }
    async put(localPath, remotePath) {
        const r = await this.run('mkdir -p "$(dirname \'' + remotePath + '\')" && cp "' + localPath + '" "' + remotePath + '"')
        return r.exitCode === 0 ? { copied: remotePath } : { error: r.stderr }
    }
    async get(remotePath, localPath) {
        const r = await this.run('cp "' + remotePath + '" "' + localPath + '"')
        return r.exitCode === 0 ? { copied: localPath } : { error: r.stderr }
    }
}
