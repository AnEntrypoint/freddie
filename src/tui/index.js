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
    // npx on Windows (incl. `npx github:...`) frequently hands the spawned
    // node process a real console for stdout but a stdin handle that reports
    // isTTY===false even though the user is sitting at an interactive
    // terminal (npx's own .cmd/.ps1 shim does not reliably forward the
    // console's stdin handle through its child spawn on Windows). Genuine
    // piped/scripted input never has stdout.isTTY true with stdin.isTTY
    // false in this specific way — real redirection (`freddie run < file`,
    // a CI runner) also leaves stdout non-TTY when stdout itself is
    // redirected, or leaves BOTH true when stdout is a real console but
    // input comes from an actual pipe with data behind it. Treating this
    // exact mismatch as "still interactive" and forcing readline's
    // terminal:true mode (see interactive.js) avoids the silent
    // immediate-EOF-close this combination used to produce: readline in
    // terminal:false mode treats a non-blocking/inherited-but-unreadable
    // stdin handle as EOF right away, closes, and the process exits 0 with
    // no output and no error — indistinguishable from a hang-free crash.
    const stdinLooksNonInteractive = !process.stdin.isTTY && !process.stdout.isTTY
    if (stdinLooksNonInteractive) {
        log.info('non-tty, falling back to readline cli')
        return interactive({ output, callLLM, resume })
    }
    if (!process.stdin.isTTY) {
        log.info('stdout is a tty but stdin reports non-tty (npx/Windows stdio-inheritance quirk) — forcing interactive readline in terminal mode instead of the pi-tui/EOF-silent-exit path')
        return interactive({ output, callLLM, resume, forceTerminal: true })
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
