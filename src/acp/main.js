import { AcpServer } from './server.js'
export async function startAcpStdio() {
    try { const { resumeAll } = await import('../machines/resume.js'); await resumeAll() } catch (_) {}
    const srv = new AcpServer()
    srv.start()
    process.on('SIGINT', () => { srv.stop(); process.exit(0) })
    process.on('SIGTERM', () => { srv.stop(); process.exit(0) })
    return srv
}
