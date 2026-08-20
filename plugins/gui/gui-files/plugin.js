import { listFiles, readFile, writeFile, deleteFile, moveFile, uploadFile } from './handler.js'

export default {
    name: 'gui-files',
    surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/files/tree', listFiles)
        gui.route('GET', '/api/files/read', readFile)
        gui.route('PUT', '/api/files/write', writeFile)
        gui.route('DELETE', '/api/files', deleteFile)
        gui.route('POST', '/api/files/move', moveFile)
        gui.route('POST', '/api/files/upload', uploadFile)
    },
}