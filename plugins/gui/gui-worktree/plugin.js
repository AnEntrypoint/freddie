import { listWorktrees, createWorktree, removeWorktree } from './handler.js'

export default {
    name: 'gui-worktree',
    surfaces: 'gui',
    register({ gui }) {
        gui.route('GET', '/api/worktree', listWorktrees)
        gui.route('POST', '/api/worktree', createWorktree)
        gui.route('DELETE', '/api/worktree', removeWorktree)
    },
}
