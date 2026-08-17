export class SshEnvironment {
    constructor(opts = {}) {
        this.host = opts.host
        this.user = opts.user
        this.port = opts.port || 22
        this.password = opts.password
        this.privateKey = opts.privateKey
        this.passphrase = opts.passphrase
        this.name = 'ssh'
        this._client = null
        this._connecting = null
    }

    async _connect() {
        if (this._client) return this._client
        if (this._connecting) return this._connecting
        if (!this.host) throw new Error('SshEnvironment: host is required')
        if (!this.user) throw new Error('SshEnvironment: user is required')
        if (!this.password && !this.privateKey) throw new Error('SshEnvironment: password or privateKey is required')
        const { Client } = await import('ssh2')
        this._connecting = new Promise((resolve, reject) => {
            const client = new Client()
            client.on('ready', () => { this._client = client; this._connecting = null; resolve(client) })
            client.on('error', e => { this._connecting = null; reject(e) })
            client.connect({
                host: this.host,
                port: this.port,
                username: this.user,
                password: this.password,
                privateKey: this.privateKey,
                passphrase: this.passphrase,
            })
        })
        return this._connecting
    }

    async run(cmd, { timeoutMs = 60000 } = {}) {
        const client = await this._connect()
        return new Promise((resolve) => {
            let settled = false
            const t = setTimeout(() => {
                if (settled) return
                settled = true
                resolve({ exitCode: -1, stdout: '', stderr: '[timeout]' })
            }, timeoutMs)
            client.exec(cmd, (err, stream) => {
                if (err) {
                    clearTimeout(t)
                    if (settled) return
                    settled = true
                    return resolve({ exitCode: -1, stdout: '', stderr: err.message })
                }
                let stdout = '', stderr = ''
                stream.on('data', d => { stdout += d.toString() })
                stream.stderr.on('data', d => { stderr += d.toString() })
                stream.on('close', code => {
                    clearTimeout(t)
                    if (settled) return
                    settled = true
                    resolve({ exitCode: code ?? -1, stdout, stderr })
                })
            })
        })
    }

    async _sftp() {
        const client = await this._connect()
        return new Promise((resolve, reject) => {
            client.sftp((err, sftp) => err ? reject(err) : resolve(sftp))
        })
    }

    async put(localPath, remotePath) {
        const sftp = await this._sftp()
        return new Promise((resolve, reject) => {
            sftp.fastPut(localPath, remotePath, err => err ? reject(err) : resolve({ copied: remotePath }))
        })
    }

    async get(remotePath, localPath) {
        const sftp = await this._sftp()
        return new Promise((resolve, reject) => {
            sftp.fastGet(remotePath, localPath, err => err ? reject(err) : resolve({ copied: localPath }))
        })
    }

    async shutdown() {
        if (this._client) { this._client.end(); this._client = null }
    }
}

let _ssh2Available = null
export async function probeSsh2() {
    if (_ssh2Available !== null) return _ssh2Available
    try { await import('ssh2'); _ssh2Available = true } catch { _ssh2Available = false }
    return _ssh2Available
}
