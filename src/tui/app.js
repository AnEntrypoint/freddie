import {
    CombinedAutocompleteProvider, Editor, Loader,
    ProcessTerminal, Text, TuiMainScreen,
} from '@earendil-works/pi-tui'
import { getActiveSkin } from '../skin/engine.js'
import { createSession } from '../sessions.js'
import { HANDLERS, SLASH_COMMAND_DOCS } from './commands.js'
import { editorTheme } from './theme.js'
import { style } from './style.js'
import { StatusLine } from './components.js'
import { createUiHelpers } from './ui-helpers.js'
import { createLineHandlers, attachInputListener } from './input-handlers.js'
import { loadHistory } from '../cli/repl_history.js'
import { createChainLogFormatter } from './chain-log.js'
import { ContextMinimap } from './context-minimap.js'
import { createMinimapLayout } from './minimap-layout.js'
import { getConfigValue } from '../config.js'

// The pi-tui interactive surface for `freddie run`. Same turn engine, same
// wire events, same slash commands as the readline REPL — the TUI's sole
// scrolling view is the context minimap (context-minimap.js): one row per
// turn/message, individually expandable, full terminal width. There is no
// separate transcript -- the user explicitly asked for exactly this ("we
// ONLY want a minimap the minimap must fill the screen") after the
// side-by-side HStack design still echoed prompt text into a separate
// column next to it.
//
// Construction only — rendering/notification logic lives in ui-helpers.js,
// raw-key + line-submit logic lives in input-handlers.js.
export async function runTui({ callLLM = null, resume = null } = {}) {
    const skin = getActiveSkin()
    // liveTurnMessages: message-shaped entries synthesized from wire events
    // (message.append, tool.end) as an in-progress turn happens, so live
    // consumers of state (the context minimap) can reflect what's actually
    // occurring right now -- state.messages itself only updates once, after
    // the WHOLE turn resolves (input-handlers.js's runPrompt sets
    // state.messages = out.messages at the very end), so during a long
    // in-flight turn state.messages alone stays exactly what it was before
    // the turn started, showing "0 tokens used" for a turn that is
    // genuinely mid-flight and burning real context. See input-handlers.js's
    // runPrompt for where this is populated/cleared.
    const state = { messages: [], liveTurnMessages: [], session: null, exit: false, planMode: false, approvalMode: null, turnActive: false, pendingApproval: null, pendingAsk: null, queuedMessages: [], toastText: null, toastTimer: null, lastRealContextUsage: null, lastUsageTotals: null }

    const tui = new TuiMainScreen(new ProcessTerminal())
    const editor = new Editor(tui, editorTheme, { paddingX: 1 })
    // Up-arrow recall, seeded from disk so it survives across freddie
    // restarts — addToHistory is the same public method onSubmit already
    // calls per line, applied here in reverse so the most-recent-first
    // load order ends up in the same most-recent-first order in the
    // editor's own history array (each addToHistory unshifts).
    for (const line of loadHistory(process.cwd()).slice().reverse()) editor.addToHistory(line)
    editor.setAutocompleteProvider(new CombinedAutocompleteProvider(
        Object.keys(HANDLERS).map(name => ({ name, description: SLASH_COMMAND_DOCS[name] })),
        process.cwd(),
    ))
    // statusText is resolved lazily via this mutable holder so StatusLine
    // (built before ui exists) and ui.refresh (built after) can share one
    // status-bar instance without a circular construction order. minimap's
    // own onRefresh callback below is the same pattern -- a closure over
    // the outer `ui` binding, called only once ui is actually assigned.
    let uiRef = null
    const status = new StatusLine(() => uiRef ? uiRef.statusText() : '')

    // The context minimap: one row per turn/message, a colored bar + token
    // count + content-type label, individually expandable via ctrl+o
    // navigation mode (raw-keys.js). This IS the sole scrolling view --
    // there is no separate transcript, so every kind of turn output (tool
    // results, assistant prose, the user's own prompts) as well as every
    // ephemeral UI notice (errors, resume markers, console passthrough)
    // renders through it. state.messages alone is stale during an
    // in-flight turn (only updated once the whole turn resolves,
    // input-handlers.js's runPrompt) -- state.liveTurnMessages fills the
    // gap with what's actually happening right now, so a turn in progress
    // shows its own tool calls as they land.
    //
    // agent.model (a single scalar string) is empty by default -- AGENTS.md's
    // documented LLM resolver priority puts agent.model_preference (an
    // array) and auto-chain discovery ahead of it, so most real sessions
    // never set the scalar at all. Falling back to model_preference's first
    // entry when the scalar is empty means the minimap can still show a
    // real percentage for that common case instead of permanently reading
    // "window unknown" for every session that relies on the array/auto-chain
    // path -- best-effort, not the same as knowing the ACTUALLY resolved
    // model for a comma-list/fallback chain, but strictly better than never
    // resolving anything.
    const getMinimapModel = () => {
        const scalar = getConfigValue('agent.model', '')
        if (scalar) return scalar
        const pref = getConfigValue('agent.model_preference', [])
        const first = Array.isArray(pref) ? pref.find(p => p && p.model) : null
        return first?.model || ''
    }
    const minimap = new ContextMinimap(
        () => [...state.messages, ...state.liveTurnMessages],
        getMinimapModel,
        () => uiRef?.refresh(),
        () => state.turnActive,
        () => state.lastRealContextUsage,
        () => state.lastUsageTotals,
    )

    const ui = createUiHelpers({ tui, minimap, status, skin, state })
    // Attached to state (same convention as state.runPrompt below) so
    // commands.js's HANDLERS.resume can drive the session picker without
    // every HANDLERS entry needing a ui param threaded through both call
    // sites (this file's startup --resume path and input-handlers.js's
    // /resume slash-command path).
    state.ui = ui
    uiRef = ui
    const loader = new Loader(tui, s => style.cyan(s), s => style.dim(s), 'working…')
    ui.setBusy = ui.makeSetBusy(loader, editor)

    tui.addChild(new Text(`${skin.branding.welcome} ${style.dim('-- /help for commands -- enter sends -- shift+enter adds a line -- ctrl+c cancels/quits -- ctrl+o browses context')}`, 1, 0))
    tui.addChild(createMinimapLayout(minimap))
    tui.addChild(editor)
    tui.addChild(status)

    let resolveDone
    const done = new Promise(r => { resolveDone = r })
    let quitting = false
    ui.quit = () => {
        if (quitting) return
        quitting = true
        // Restore the real console before teardown so exit-time logs land
        // on stdout, not in a minimap that will never render again.
        Object.assign(console, origConsole)
        tui.stop()
        resolveDone()
    }

    // Subsystems (dotenvx, acptoapi chain logs, gm-learn) write via console —
    // raw writes would tear the differential frame, so while the TUI runs
    // the console is rerouted into minimap notices. pi-tui writes via
    // terminal.write, not console, so its own output is unaffected.
    const origConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error }
    const safe = (a) => { if (typeof a === 'string') return a; try { return JSON.stringify(a) } catch { return String(a) } }
    const chainLog = createChainLogFormatter({ style })
    console.log = (...a) => {
        const line = a.map(safe).join(' ')
        const formatted = chainLog(line)
        // suppress:true is a recognized chain line the formatter deliberately
        // wants hidden (normal-path noise, not a real signal) -- distinct
        // from a falsy/null return (not a chain line at all), which falls
        // through to ui.note(line) below and would otherwise print the raw
        // unformatted "[chain] chat try ..." string as a permanent line.
        if (formatted?.suppress) { /* deliberately shown nowhere */ }
        else if (formatted) ui.noteLive('chain-status', formatted.text, { update: formatted.update })
        else ui.note(line)
    }
    console.info = (...a) => ui.note(a.map(safe).join(' '))
    console.warn = (...a) => ui.note(a.map(safe).join(' '), style.yellow)
    console.error = (...a) => ui.note(a.map(safe).join(' '), style.red)

    const { onLine, runPrompt, steerNow } = createLineHandlers({ tui, editor, state, ui, skin, callLLM })
    state.runPrompt = runPrompt
    attachInputListener({ tui, editor, state, ui, steerNow, minimap })
    editor.onSubmit = (text) => { void onLine(text) }

    // Resume a prior conversation when requested (--resume [id]); otherwise
    // start a fresh session. sessions.js is async (libsql) and MUST be
    // awaited — a bare call silently wraps in a rejecting Promise so the row
    // is never persisted and history is lost. HANDLERS.resume sets
    // state.messages directly, which the minimap already reads live on
    // every render() call -- the ui.refresh() below (end of setup) is the
    // repaint that picks it up, no separate rebuild step needed.
    if (resume !== null && resume !== false) {
        const msg = await HANDLERS.resume(state, typeof resume === 'string' ? [resume] : [])
        ui.note(msg)
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
