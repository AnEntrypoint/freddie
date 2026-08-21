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

    async run(cmd, { timeoutMs = 120000 } = {}) {
        const container = await this._ensureContainer()
        const exec = await container.exec({ Cmd: ['sh', '-c', cmd], AttachStdout: true, AttachStderr: true, WorkingDir: this.cwd })
        return new Promise((resolve) => {
            let settled = false
            const t = setTimeout(() => { if (settled) return; settled = true; resolve({ exitCode: -1, stdout: '', stderr: '[timeout]' }) }, timeoutMs)
            exec.start({}, (err, stream) => {
                if (err) { clearTimeout(t); if (settled) return; settled = true; return resolve({ exitCode: -1, stdout: '', stderr: err.message }) }
                let stdout = '', stderr = ''
                this._docker.modem.demuxStream(stream, { write: d => { stdout += d.toString() } }, { write: d => { stderr += d.toString() } })
                stream.on('end', async () => {
                    clearTimeout(t)
                    if (settled) return
                    settled = true
                    try {
                        const inspect = await exec.inspect()
                        resolve({ exitCode: inspect.ExitCode ?? -1, stdout, stderr })
                    } catch (e) { resolve({ exitCode: -1, stdout, stderr: stderr + '\n' + e.message }) }
                })
                stream.on('error', e => { clearTimeout(t); if (settled) return; settled = true; resolve({ exitCode: -1, stdout, stderr: stderr + '\n' + e.message }) })
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
