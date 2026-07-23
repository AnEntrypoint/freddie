import { gitStatus, gitDiff, gitLog } from './handler.js'

export default {
    name: 'gui-git',
    surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/git/status', gitStatus)
        gui.route('GET', '/api/git/diff', gitDiff)
        gui.route('GET', '/api/git/log', gitLog)
    },
}
