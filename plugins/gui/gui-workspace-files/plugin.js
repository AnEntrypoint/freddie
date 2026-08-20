import { listWorkspaceFiles } from './handler.js'

export default {
    name: 'gui-workspace-files',
    surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/sessions/:id/workspace-files', listWorkspaceFiles)
    },
}
