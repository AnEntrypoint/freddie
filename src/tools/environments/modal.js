import { spawn } from 'node:child_process'
import { BaseEnvironment } from './base.js'

export class ModalEnvironment extends BaseEnvironment {
    constructor(opts = {}) {
        super(opts)
        this.name = 'modal'
        this.app = opts.app || 'freddie-sandbox'
        this.image = opts.image || 'python:3.11'
        this.cwd = opts.cwd || '/sandbox'
        this.token = process.env.MODAL_TOKEN_ID
        this.secret = process.env.MODAL_TOKEN_SECRET
    }
    async run(cmd, { timeoutMs = 120000 } = {}) {
        if (!this.token) return { exitCode: -1, stdout: '', stderr: 'MODAL_TOKEN_ID required' }
        return new Promise(resolve => {
            const env = { ...process.env, MODAL_TOKEN_ID: this.token, MODAL_TOKEN_SECRET: this.secret }
            const child = spawn('modal', ['run', '--detach=false', '-q', '-', cmd], { env, shell: process.platform === 'win32' })
            let stdout = '', stderr = ''
            const t = setTimeout(() => { try { child.kill('SIGKILL') } catch {} resolve({ exitCode: -1, stdout, stderr: stderr + '\n[timeout]' }) }, timeoutMs)
            child.stdout?.on('data', d => stdout += d.toString())
            child.stderr?.on('data', d => stderr += d.toString())
            child.on('close', code => { clearTimeout(t); resolve({ exitCode: code, stdout, stderr }) })
            child.on('error', e => { clearTimeout(t); resolve({ exitCode: -1, stdout, stderr: stderr + '\n' + e.message }) })
        })
    }
    async put(localPath, remotePath) { return { error: 'modal put requires modal volume put: ' + localPath + ' -> ' + remotePath } }
    async get(remotePath, localPath) { return { error: 'modal get requires modal volume get: ' + remotePath + ' -> ' + localPath } }
}

export class ManagedModalEnvironment extends ModalEnvironment {
    constructor(opts = {}) { super({ ...opts, app: opts.app || 'freddie-managed' }); this.name = 'managed_modal' }
}
