export class DockerEnvironment {
    constructor(opts = {}) {
        this.image = opts.image || 'ubuntu:latest'
        this.cwd = opts.cwd || '/workspace'
        this.name = 'docker'
        this._docker = null
        this._container = null
        this._starting = null
    }

    async _ensureContainer() {
        if (this._container) return this._container
        if (this._starting) return this._starting
        if (!(await probeDockerode())) throw new Error('DockerEnvironment: dockerode is not available (npm install dockerode)')
        this._starting = (async () => {
            const { default: Docker } = await import('dockerode')
            this._docker = new Docker()
            const container = await this._docker.createContainer({
                Image: this.image,
                Cmd: ['sleep', 'infinity'],
                WorkingDir: this.cwd,
                Tty: false,
                HostConfig: { AutoRemove: true },
            })
            await container.start()
            this._container = container
            this._starting = null
            return container
        })()
        return this._starting
    }

    // signal: the owning turn's AbortController signal (machine.js) -- same
    // contract as LocalEnvironment.run, so a turn-level cancel/timeout can
    // stop an in-flight docker exec too, not just a bare local subprocess.
    async run(cmd, { timeoutMs = 120000, signal = null } = {}) {
        const container = await this._ensureContainer()
        // Wrap the real command so its PID is discoverable from a SECOND exec
        // afterward: `echo $$` prints the shell's own PID as the first line of
        // stdout, which is also the PID any child process the command spawns
        // inherits as its process-group leader for a simple `sh -c` command --
        // matches AutoRemove-container semantics where PID 1 in the exec's own
        // namespace is this shell. `kill -9 <pid>` (issued via a fresh exec
        // when the timeout/abort fires) actually terminates the running
        // command inside the container, unlike merely destroying the local
        // demuxed stream (which stops US from reading output but leaves the
        // container-side process running to its own completion).
        const exec = await container.exec({ Cmd: ['sh', '-c', 'echo $$; exec ' + cmd], AttachStdout: true, AttachStderr: true, WorkingDir: this.cwd })
        let remotePid = null
        const killRemote = () => {
            if (!remotePid) return
            container.exec({ Cmd: ['kill', '-9', String(remotePid)], AttachStdout: false, AttachStderr: false })
                .then(killExec => killExec.start({}, () => {}))
                .catch(() => {})
        }
        return new Promise((resolve) => {
            let settled = false
            const finish = (result) => { if (settled) return; settled = true; clearTimeout(t); signal?.removeEventListener('abort', onAbort); resolve(result) }
            const t = setTimeout(() => { killRemote(); finish({ exitCode: -1, stdout: '', stderr: '[timeout]', timedOut: true }) }, timeoutMs)
            const onAbort = () => { killRemote(); finish({ exitCode: -1, stdout: '', stderr: '[aborted: turn ended]', aborted: true }) }
            if (signal) {
                if (signal.aborted) onAbort()
                else signal.addEventListener('abort', onAbort, { once: true })
            }
            exec.start({}, (err, stream) => {
                if (err) return finish({ exitCode: -1, stdout: '', stderr: err.message })
                let stdout = '', stderr = '', pidCaptured = false
                const captureFirstLineAsPid = (chunk) => {
                    if (pidCaptured) { stdout += chunk; return }
                    const text = stdout + chunk
                    const nl = text.indexOf('\n')
                    if (nl === -1) { stdout = text; return }
                    const pidLine = text.slice(0, nl).trim()
                    if (/^\d+$/.test(pidLine)) remotePid = Number(pidLine)
                    stdout = text.slice(nl + 1)
                    pidCaptured = true
                }
                this._docker.modem.demuxStream(stream, { write: d => captureFirstLineAsPid(d.toString()) }, { write: d => { stderr += d.toString() } })
                stream.on('end', async () => {
                    if (settled) return
                    try {
                        const inspect = await exec.inspect()
                        finish({ exitCode: inspect.ExitCode ?? -1, stdout, stderr })
                    } catch (e) { finish({ exitCode: -1, stdout, stderr: stderr + '\n' + e.message }) }
                })
                stream.on('error', e => finish({ exitCode: -1, stdout, stderr: stderr + '\n' + e.message }))
            })
        })
    }

    async put(localPath, remotePath) {
        const container = await this._ensureContainer()
        const path = await import('node:path')
        const tarStream = await import('tar-stream')
        const fs = await import('node:fs')
        const pack = tarStream.pack()
        const dir = path.dirname(remotePath)
        const base = path.basename(remotePath)
        const data = fs.readFileSync(localPath)
        pack.entry({ name: base }, data)
        pack.finalize()
        await container.putArchive(pack, { path: dir })
        return { copied: remotePath }
    }

    async get(remotePath, localPath) {
        const container = await this._ensureContainer()
        const path = await import('node:path')
        const fs = await import('node:fs')
        const stream = await container.getArchive({ path: remotePath })
        const chunks = []
        await new Promise((resolve, reject) => {
            stream.on('data', d => chunks.push(d))
            stream.on('end', resolve)
            stream.on('error', reject)
        })
        const tarStream = await import('tar-stream')
        const extract = tarStream.extract()
        const buf = Buffer.concat(chunks)
        await new Promise((resolve, reject) => {
            extract.on('entry', (header, entryStream, next) => {
                const out = []
                entryStream.on('data', d => out.push(d))
                entryStream.on('end', () => { fs.mkdirSync(path.dirname(localPath), { recursive: true }); fs.writeFileSync(localPath, Buffer.concat(out)); next() })
                entryStream.resume()
            })
            extract.on('finish', resolve)
            extract.on('error', reject)
            extract.end(buf)
        })
        return { copied: localPath }
    }

    async shutdown() {
        if (this._container) {
            try { await this._container.stop() } catch {}
            this._container = null
        }
    }
}

let _dockerodeAvailable = null
export async function probeDockerode() {
    if (_dockerodeAvailable !== null) return _dockerodeAvailable
    try { await import('dockerode'); _dockerodeAvailable = true } catch { _dockerodeAvailable = false }
    return _dockerodeAvailable
}
