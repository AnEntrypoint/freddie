import { interactive } from '../cli/interactive.js'
import { logger } from '../observability/log.js'

const log = logger('tui')

let _piTui = null
async function probePiTui() {
    if (_piTui !== null) return _piTui
    try { _piTui = await import('@mariozechner/pi-tui') } catch { _piTui = false }
    return _piTui
}

export async function launchTui({ output = process.stdout, callLLM = null } = {}) {
    const tui = await probePiTui()
    if (!tui) {
        log.info('pi-tui unavailable, falling back to readline cli')
        return interactive({ output, callLLM })
    }
    if (!process.stdout.isTTY) {
        log.info('non-tty, falling back to readline cli')
        return interactive({ output, callLLM })
    }
    if (typeof tui.InteractiveMode === 'function') return new tui.InteractiveMode({ callLLM })
    log.info('pi-tui shape unfamiliar, falling back')
    return interactive({ output, callLLM })
}
