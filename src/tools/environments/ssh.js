export class SshEnvironment {
    constructor(opts = {}) { this.host = opts.host; this.user = opts.user; this.name = 'ssh' }
    async run(_cmd) { throw new Error('SshEnvironment: install ssh2 and replace this method') }
    async put() { throw new Error('SshEnvironment: install ssh2') }
    async get() { throw new Error('SshEnvironment: install ssh2') }
    async shutdown() {}
}

let _ssh2Available = null
export async function probeSsh2() {
    if (_ssh2Available !== null) return _ssh2Available
    try { await import('ssh2'); _ssh2Available = true } catch { _ssh2Available = false }
    return _ssh2Available
}
