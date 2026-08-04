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
    // Inside a tmux/psmux pane, stdin is a pty, not a real Win32 console
    // handle. pi-tui's Windows raw-mode setup (Terminal.enableWindowsVTInput)
    // unconditionally loads a native addon that calls SetConsoleMode on the
    // console handle — against a pty that call corrupts/bypasses Node's own
    // cross-platform setRawMode(true), leaving all keyboard input (including
    // Ctrl+C) undelivered while the process stays alive and unresponsive.
    // process.env.TMUX is set by tmux (and psmux, which IS tmux 3.3.7 built
    // for Windows) in every pane — skip straight to the readline fallback,
    // which has no raw-mode/native-console dependency and works correctly.
    if (process.platform === 'win32' && process.env.TMUX) {
        log.info('win32 + tmux/psmux pty detected, falling back to readline cli (pi-tui raw-mode input is broken under this combination)')
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
