import { LocalEnvironment } from './local.js'
import { DockerEnvironment } from './docker.js'
import { SshEnvironment } from './ssh.js'
import { ModalEnvironment, ManagedModalEnvironment } from './modal.js'
import { DaytonaEnvironment } from './daytona.js'
import { SingularityEnvironment } from './singularity.js'
import { VercelSandboxEnvironment } from './vercel_sandbox.js'
import { BaseEnvironment } from './base.js'
import { syncTo, syncFrom, diffManifest } from './file_sync.js'
import { getConfigValue } from '../../config.js'

const FACTORIES = {
    local: (opts) => new LocalEnvironment(opts),
    docker: (opts) => new DockerEnvironment(opts),
    ssh: (opts) => new SshEnvironment(opts),
    modal: (opts) => new ModalEnvironment(opts),
    managed_modal: (opts) => new ManagedModalEnvironment(opts),
    daytona: (opts) => new DaytonaEnvironment(opts),
    singularity: (opts) => new SingularityEnvironment(opts),
    vercel_sandbox: (opts) => new VercelSandboxEnvironment(opts),
}

export function listEnvironments() { return Object.keys(FACTORIES) }

export function createEnvironment(name, opts = {}) {
    const f = FACTORIES[name]
    if (!f) throw new Error('unknown environment: ' + name + ' (available: ' + Object.keys(FACTORIES).join(', ') + ')')
    return f(opts)
}

export function defaultEnvironment(opts = {}) {
    const name = getConfigValue('terminal.environment', 'local')
    return createEnvironment(name, opts)
}

export { LocalEnvironment, DockerEnvironment, SshEnvironment, ModalEnvironment, ManagedModalEnvironment, DaytonaEnvironment, SingularityEnvironment, VercelSandboxEnvironment, BaseEnvironment, syncTo, syncFrom, diffManifest }
