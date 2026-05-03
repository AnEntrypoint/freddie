import { AcpServer } from './server.js'
export function startAcpStdio() {
    const srv = new AcpServer()
    srv.start()
    process.on('SIGINT', () => { srv.stop(); process.exit(0) })
    process.on('SIGTERM', () => { srv.stop(); process.exit(0) })
    return srv
}
