export class DockerEnvironment {
    constructor(opts = {}) { this.image = opts.image || 'ubuntu:latest'; this.name = 'docker' }
    async run(_cmd) { throw new Error('DockerEnvironment: install dockerode and replace this method') }
    async put() { throw new Error('DockerEnvironment: install dockerode') }
    async get() { throw new Error('DockerEnvironment: install dockerode') }
    async shutdown() {}
}

let _dockerodeAvailable = null
export async function probeDockerode() {
    if (_dockerodeAvailable !== null) return _dockerodeAvailable
    try { await import('dockerode'); _dockerodeAvailable = true } catch { _dockerodeAvailable = false }
    return _dockerodeAvailable
}
