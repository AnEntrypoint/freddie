import { logger } from '../observability/log.js'

const log = logger('rl')

export function listRollouts() { return [] }
export function replayTrajectory(_id) { throw new Error('rl.replay: atropos integration out of scope. Set ATROPOS_URL and provide an adapter.') }
export function score(_traj) { throw new Error('rl.score: atropos integration out of scope.') }

export function rlSubcommand({ args = [] } = {}) {
    const [action] = args
    if (!action || action === 'list') {
        log.info('rl list')
        console.log('No rollouts available. Tinker/Atropos integration is documented as a residual; configure ATROPOS_URL and provide an adapter to enable.')
        return 0
    }
    console.log('rl: action "' + action + '" requires Atropos. See ARCHITECTURE residual.')
    return 1
}
