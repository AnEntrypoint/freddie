import {
    CombinedAutocompleteProvider, Container, Editor, Loader,
    ProcessTerminal, Text, TUI,
} from '@earendil-works/pi-tui'
import { getActiveSkin } from '../skin/engine.js'
import { createSession } from '../sessions.js'
import { HANDLERS, SLASH_COMMAND_DOCS } from './commands.js'
import { editorTheme } from './theme.js'
import { style } from './style.js'
import { StatusLine } from './components.js'
import { createUiHelpers } from './ui-helpers.js'
import { createLineHandlers, attachInputListener } from './input-handlers.js'

// The pi-tui interactive surface for `freddie run`. Same turn engine, same
// wire events, same slash commands as the readline REPL — the TUI is just
// another wire client with a richer layout: scrollable transcript (Markdown
// assistant blocks stream live), tool status lines, a multi-line editor,
// and a status bar. Resolves when the user quits.
//
// Construction only — rendering/notification logic lives in ui-helpers.js,
// raw-key + line-submit logic lives in input-handlers.js.
export async function runTui({ callLLM = null, resume = null } = {}) {
    const skin = getActiveSkin()
    const state = { messages: [], session: null, exit: false, planMode: false, approvalMode: null, turnActive: false, pendingApproval: null, pendingAsk: null, queuedMessages: [], toastText: null, toastTimer: null }

    const tui = new TUI(new ProcessTerminal())
    const transcript = new Container()
    const editor = new Editor(tui, editorTheme, { paddingX: 1 })
    editor.setAutocompleteProvider(new CombinedAutocompleteProvider(
        Object.keys(HANDLERS).map(name => ({ name, description: SLASH_COMMAND_DOCS[name] })),
        process.cwd(),
    ))
    // statusText is resolved lazily via this mutable holder so StatusLine
    // (built before ui exists) and ui.refresh (built after) can share one
    // status-bar instance without a circular construction order.
    let uiRef = null
    const status = new StatusLine(() => uiRef ? uiRef.statusText() : '')
    const ui = createUiHelpers({ tui, transcript, status, skin, state })
    uiRef = ui
    const loader = new Loader(tui, s => style.cyan(s), s => style.dim(s), 'working…')
    ui.setBusy = ui.makeSetBusy(loader, editor)

    tui.addChild(new Text(`${skin.branding.welcome} ${style.dim('— /help for commands · enter sends · shift+enter adds a line · ctrl+c cancels/quits')}`, 1, 0))
    tui.addChild(transcript)
    tui.addChild(editor)
    tui.addChild(status)

    let resolveDone
    const done = new Promise(r => { resolveDone = r })
    let quitting = false
    ui.quit = () => {
        if (quitting) return
        quitting = true
        // Restore the real console before teardown so exit-time logs land
        // on stdout, not in a transcript that will never render again.
        Object.assign(console, origConsole)
        tui.stop()
        resolveDone()
    }

    // Subsystems (dotenvx, acptoapi chain logs, gm-learn) write via console —
    // raw writes would tear the differential frame, so while the TUI runs
    // the console is rerouted into the transcript as notes. pi-tui writes
    // via terminal.write, not console, so its own output is unaffected.
    const origConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error }
    const safe = (a) => { if (typeof a === 'string') return a; try { return JSON.stringify(a) } catch { return String(a) } }
    console.log = (...a) => ui.note(a.map(safe).join(' '))
    console.info = (...a) => ui.note(a.map(safe).join(' '))
    console.warn = (...a) => ui.note(a.map(safe).join(' '), style.yellow)
    console.error = (...a) => ui.note(a.map(safe).join(' '), style.red)

    const { onLine, steerNow } = createLineHandlers({ tui, transcript, editor, state, ui, skin, callLLM })
    attachInputListener({ tui, editor, state, ui, steerNow })
    editor.onSubmit = (text) => { void onLine(text) }

    // Resume a prior conversation when requested (--resume [id]); otherwise
    // start a fresh session. sessions.js is async (libsql) and MUST be
    // awaited — a bare call silently wraps in a rejecting Promise so the row
    // is never persisted and history is lost.
    if (resume !== null && resume !== false) {
        const msg = await HANDLERS.resume(state, typeof resume === 'string' ? [resume] : [])
        ui.note(msg)
        ui.renderHistory()
    }
    if (!state.session) state.session = await createSession({ platform: 'cli' })

    tui.setFocus(editor)
    tui.start()
    ui.markStarted()
    ui.refresh()

    // Idle refresh (kimi's _IDLE_REFRESH_INTERVAL): the git badge resolves
    // asynchronously in the background (git-badge.js) and the toast timer
    // needs its own tick — a light periodic invalidate picks both up without
    // requiring every async event to manually call refresh().
    const idleTimer = setInterval(ui.refresh, 1000)
    if (typeof idleTimer.unref === 'function') idleTimer.unref()
    done.finally(() => clearInterval(idleTimer))

    return done
}
