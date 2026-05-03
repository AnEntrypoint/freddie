import { EventEmitter } from 'node:events'
export class BasePlatformAdapter extends EventEmitter {
    constructor(opts = {}) { super(); this.opts = opts; this.platform = opts.platform || 'unknown'; this._running = false }
    getRequiredEnv() { return [] }
    isReady() {
        const need = this.getRequiredEnv()
        return need.every(e => process.env[e] || this.opts[e.toLowerCase()])
    }
    async start() { if (!this.isReady()) throw new Error(this.constructor.name + ': missing env: ' + this.getRequiredEnv().join(', ')); this._running = true }
    async stop() { this._running = false }
    async send(_reply) { throw new Error(this.constructor.name + '.send must be overridden') }
    isRunning() { return this._running }
}
