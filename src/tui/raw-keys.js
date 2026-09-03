// Raw-key interception for the pi-tui shell: ctrl+c cancel/quit, approval
// y/n/a + arrow/enter navigation, ctrl+s immediate steer, ↑ recall of the
// last queued message. Split out of input-handlers.js (which owns the
// higher-level line-submit dispatch) purely to keep each file under the
// 200-line vertical-slice cap.
import { Key, matchesKey } from '@earendil-works/pi-tui'
import { cancelTurn, unqueueLast, unqueueFirst } from '../agent/live-turns.js'
import { resolveCommand } from '../commands/registry.js'
import { APPROVAL_CHOICES } from './ui-helpers.js'

// Shell-only commands (session/config/nav — never sensible injected into a
// running turn) are blocked from queue/steer, mirroring kimi's
// parse_slash_command_call + shell_registry.find_command guard: a command
// typed mid-turn would otherwise be misrouted through queueTurn/steerTurn
// instead of the shell dispatcher that actually handles it.
const isBlockedMidTurnCommand = (line) => line.startsWith('/') && resolveCommand(line) !== null

// Registers the raw ctrl+c / approval-key / ctrl+s / up-arrow input
// listener on the tui instance. Kept as a function (not inlined in app.js)
// so the key-handling policy is legible on its own. `minimap` (the
// ContextMinimap instance) is optional -- when omitted, ctrl+o is a no-op
// (no minimap to browse).
export function attachInputListener({ tui, editor, state, ui, steerNow, minimap }) {
    let approvalCursor = 0
    tui.addInputListener((data) => {
        if (matchesKey(data, Key.ctrl('c'))) {
            if (state.pendingSessionPick) {
                const resolve = state.pendingSessionPickResolve
                ui.cancelSessionPick()
                state.pendingSessionPickResolve = null
                resolve?.(null)
            }
            else if (state.pendingApproval) ui.answerApproval('n')
            else if (minimap?.navActive) { minimap.setNavActive(false); ui.refresh() }
            else {
                // Per direct user request: ctrl+c always quits immediately,
                // even mid-turn -- the prior two-stage design (first ctrl+c
                // cancels the running turn, a SECOND ctrl+c once idle quits)
                // read as "ctrl+c doesn't work" to a user who just wants out
                // right now. cancelTurn() still fires first (best-effort,
                // fire-and-forget) so an in-flight LLM/tool call gets its
                // abort signal and the turn's own bookkeeping settles
                // cleanly if it can -- ui.quit() does not wait on it, since
                // process_teardown.js's own handle-closing already tears
                // down whatever is left regardless of turn state.
                if (state.turnActive) { state.stopResumeChain = true; cancelTurn(state.session) }
                ui.quit()
            }
            return { consume: true }
        }
        // A pending session-resume pick owns up/down/enter/escape until
        // resolved -- checked before pendingApproval since the two are
        // mutually exclusive states (a resume pick only happens idle,
        // before any turn/approval could be in flight) but this ordering
        // keeps the precedence explicit rather than assumed.
        if (state.pendingSessionPick) {
            if (matchesKey(data, Key.escape)) {
                const resolve = state.pendingSessionPickResolve
                ui.cancelSessionPick()
                state.pendingSessionPickResolve = null
                resolve?.(null)
                return { consume: true }
            }
            if (matchesKey(data, Key.up)) { ui.moveSessionPick(-1); return { consume: true } }
            if (matchesKey(data, Key.down)) { ui.moveSessionPick(1); return { consume: true } }
            if (matchesKey(data, Key.enter)) {
                const resolve = state.pendingSessionPickResolve
                const chosen = ui.confirmSessionPick()
                state.pendingSessionPickResolve = null
                resolve?.(chosen)
                return { consume: true }
            }
            ui.toast('(resuming -- up/down select, enter confirm, esc cancel)')
            return { consume: true }
        }
        // A pending approval owns y/n/a/escape, arrow-navigation, number keys
        // 1-3, and enter (confirms the arrow-selected choice) until resolved.
        if (state.pendingApproval) {
            if (matchesKey(data, 'y') || matchesKey(data, '1')) { ui.answerApproval('y'); return { consume: true } }
            if (matchesKey(data, 'n') || matchesKey(data, '2') || matchesKey(data, Key.escape)) { ui.answerApproval('n'); return { consume: true } }
            if (matchesKey(data, 'a') || matchesKey(data, '3')) { ui.answerApproval('a'); return { consume: true } }
            if (matchesKey(data, Key.up)) { approvalCursor = (approvalCursor + APPROVAL_CHOICES.length - 1) % APPROVAL_CHOICES.length; ui.refresh(); return { consume: true } }
            if (matchesKey(data, Key.down)) { approvalCursor = (approvalCursor + 1) % APPROVAL_CHOICES.length; ui.refresh(); return { consume: true } }
            if (matchesKey(data, Key.enter)) { ui.answerApproval(APPROVAL_CHOICES[approvalCursor]); return { consume: true } }
            return
        }
        // Ctrl+O: toggle minimap navigation mode. While active, up/down move
        // the row cursor and enter opens/closes the selected row in place --
        // this IS the collapsible element (context-minimap.js), so no
        // separate fold-in-transcript mechanism exists. Escape or ctrl+o
        // again exits back to normal editor input.
        if (matchesKey(data, Key.ctrl('o'))) {
            if (!minimap) return { consume: true }
            minimap.setNavActive(!minimap.navActive)
            ui.refresh()
            return { consume: true }
        }
        if (minimap?.navActive) {
            if (matchesKey(data, Key.escape)) { minimap.setNavActive(false); ui.refresh(); return { consume: true } }
            if (matchesKey(data, Key.up)) { minimap.moveSelection(-1); ui.refresh(); return { consume: true } }
            if (matchesKey(data, Key.down)) { minimap.moveSelection(1); ui.refresh(); return { consume: true } }
            if (matchesKey(data, Key.enter)) { minimap.toggleSelected(); ui.refresh(); return { consume: true } }
            // Any other key while browsing is swallowed (typing must not
            // leak into the editor mid-browse), but never silently -- a
            // stray keystroke a user thought went to the editor would
            // otherwise just vanish with zero signal. Named per key so the
            // toast is genuinely useful (kimi's toast() convention, same as
            // the blocked-mid-turn-command toast elsewhere in this file).
            ui.toast('(browsing context -- esc or ctrl+o to type again)')
            return { consume: true }
        }
        // Ctrl+S: immediate steer (kimi's Ctrl+S). Text in the editor steers
        // that text now; on an empty editor with queued messages, pops the
        // oldest queued message and steers it instead (FIFO, kimi parity).
        if (matchesKey(data, Key.ctrl('s'))) {
            if (!state.turnActive) return { consume: true }
            const text = editor.getText().trim()
            if (text) {
                if (isBlockedMidTurnCommand(text)) { ui.toast(`/${text.slice(1).split(/\s+/)[0]} is not available during streaming`); return { consume: true } }
                editor.setText('')
                steerNow(text)
            } else {
                const popped = unqueueFirst(state.session)
                if (popped) { state.queuedMessages.shift(); steerNow(popped) }
            }
            return { consume: true }
        }
        // ↑ on an empty editor recalls the last queued message for editing
        // (kimi's should_handle_running_prompt_key up-case) — only when the
        // buffer is empty, so normal cursor-up history navigation still works.
        if (matchesKey(data, Key.up) && state.queuedMessages.length && !editor.getText().trim()) {
            const popped = unqueueLast(state.session)
            if (popped) { state.queuedMessages.pop(); editor.setText(popped) }
            ui.refresh()
            return { consume: true }
        }
    })
}
