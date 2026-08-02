import { interactive } from '../cli/interactive.js'
import { logger } from '../observability/log.js'

const log = logger('tui')

let _piTui = null
async function probePiTui() {
    if (_piTui !== null) return _piTui
    try { _piTui = await import('@earendil-works/pi-tui') } catch { _piTui = false }
    return _piTui
}

// Interactive surface for `freddie run`: the pi-tui TUI (src/tui/app.js)
// when attached to a real terminal, the readline REPL otherwise — scripted
// and piped stdin must keep working, so non-TTY always falls through.
// (The old InteractiveMode export lives in pi-coding-agent, which is not
// installed; the TUI here is built directly on pi-tui primitives.)
export async function launchTui({ output = process.stdout, callLLM = null, resume = null } = {}) {
    const tui = await probePiTui()
    if (!tui) {
        log.info('pi-tui unavailable, falling back to readline cli')
        return interactive({ output, callLLM, resume })
    }
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
        log.info('non-tty, falling back to readline cli')
        return interactive({ output, callLLM, resume })
    }
    try {
        const { runTui } = await import('./app.js')
        return await runTui({ callLLM, resume })
    } catch (e) {
        log.warn('pi-tui launch failed, falling back to readline cli', { error: e.message })
        return interactive({ output, callLLM, resume })
    }
}
