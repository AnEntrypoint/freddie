import { AcpServer } from './server.js'
import { logger } from '../observability/log.js'
const log = logger('acp_main')
export async function startAcpStdio() {
    try { const { resumeAll } = await import('../machines/resume.js'); await resumeAll() } catch (e) { log.warn('resumeAll failed during gateway boot', { err: String(e) }) }
    const srv = new AcpServer()
    srv.start()
    process.on('SIGINT', () => { srv.stop(); process.exit(0) })
    process.on('SIGTERM', () => { srv.stop(); process.exit(0) })
    return srv
}
