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
// so the key-handling policy is legible on its own.
export function attachInputListener({ tui, editor, state, ui, steerNow }) {
    let approvalCursor = 0
    tui.addInputListener((data) => {
        if (matchesKey(data, Key.ctrl('c'))) {
            if (state.pendingApproval) ui.answerApproval('n')
            else if (state.turnActive && cancelTurn(state.session)) ui.note('(cancel requested — turn will stop at the next step boundary)')
            else ui.quit()
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
