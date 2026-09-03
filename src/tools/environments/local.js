import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { killTree } from '../kill_tree.js'

export class LocalEnvironment {
    constructor(opts = {}) { this.cwd = opts.cwd || process.cwd(); this.name = 'local' }
    // signal: the owning turn's AbortController signal (machine.js), same
    // contract as plugins/tools/bash/handler.js's ctx.signal wiring -- without
    // it, a subprocess spawned through this call path (batch/cron/exec-
    // environment consumers) has no way to be cancelled when the owning turn
    // ends (turn-level timeout, cancelTurn, REVERT), leaving it running to
    // natural completion after the caller has already moved on.
    async run(cmd, { timeoutMs = 60000, signal = null } = {}) {
        return new Promise(resolve => {
            const sh = process.platform === 'win32' ? 'cmd' : 'sh'
            const flag = process.platform === 'win32' ? '/c' : '-c'
            const child = spawn(sh, [flag, cmd], { cwd: this.cwd, env: process.env })
            let stdout = '', stderr = ''
            // killTree, not bare child.kill: on Windows the spawned process IS
            // cmd.exe, and TerminateProcess against it does not propagate to
            // whatever it launched (see kill_tree.js's own header for the
            // live-witnessed ping.exe-survives repro this fixes).
            const t = setTimeout(() => { killTree(child.pid); resolve({ exitCode: -1, stdout, stderr: stderr + '\n[timeout]', timedOut: true }) }, timeoutMs)
            const onAbort = () => { clearTimeout(t); killTree(child.pid); resolve({ exitCode: -1, stdout, stderr: stderr + '\n[aborted: turn ended]', aborted: true }) }
            if (signal) {
                if (signal.aborted) onAbort()
                else signal.addEventListener('abort', onAbort, { once: true })
            }
            child.stdout?.on('data', d => stdout += d.toString())
            child.stderr?.on('data', d => stderr += d.toString())
            child.on('close', code => { clearTimeout(t); signal?.removeEventListener('abort', onAbort); resolve({ exitCode: code, stdout, stderr }) })
            child.on('error', e => { clearTimeout(t); signal?.removeEventListener('abort', onAbort); resolve({ exitCode: -1, stdout, stderr: stderr + '\n' + e.message }) })
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
