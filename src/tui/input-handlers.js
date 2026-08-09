// Input-side wiring for the pi-tui shell: raw-key interception (ctrl+c,
// approval y/n/a, ctrl+s steer, ↑ recall) and line-submit dispatch (slash
// commands, shell escape, queue/steer routing, turn execution). Depends on
// the render/notify helpers from ui-helpers.js and the turn-lifecycle
// primitives from live-turns.js/machine.js — kept separate from app.js's
// TUI-object construction so each file has one responsibility.
import { exec } from 'node:child_process'
import { Text, Markdown } from '@earendil-works/pi-tui'
import { runTurn } from '../agent/machine.js'
import { subscribeTurn, queueTurn, drainQueue, steerTurn } from '../agent/live-turns.js'
import { resolveCommand } from '../commands/registry.js'
import { appendMessage } from '../sessions.js'
import { HANDLERS, PLAN_DISABLED } from './commands.js'
import { markdownTheme } from './theme.js'
import { style } from './style.js'
import { summarizeArgs } from './ui-helpers.js'

export { attachInputListener } from './raw-keys.js'

// Builds the onLine (editor submit) handler, the runPrompt turn runner, and
// steerNow (also used by the raw-key ctrl+s handler). Returned bound to the
// given tui/transcript/editor/state/ui/skin/callLLM bag.
export function createLineHandlers({ tui, transcript, editor, state, ui, skin, callLLM }) {
    const steerNow = (text) => {
        transcript.addChild(new Text(style.bold(skin.branding.prompt_symbol) + style.cyan(text) + style.dim(' (steered)'), 1, 1))
        steerTurn(state.session, text)
        ui.refresh()
    }

    async function onLine(raw) {
        const line = raw.trim()
        if (!line) return
        editor.addToHistory(raw)

        // An open question owns the editor until every question is answered.
        if (state.pendingAsk) { ui.answerAsk(line); return }

        // Shell escape (kimi's Ctrl-X shell mode): run a local command
        // without leaving the session.
        if (line.startsWith('!')) {
            const cmd = line.slice(1).trim()
            if (!cmd) return
            ui.note(`  $ ${cmd}`)
            exec(cmd, { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                if (stdout) ui.note(stdout.replace(/\n$/, ''))
                if (stderr) ui.note(stderr.replace(/\n$/, ''), style.yellow)
                if (err && !stdout && !stderr) ui.note(`(exit ${err.code ?? 'error'})`, style.red)
            })
            return
        }

        // Shell-only slash commands (session/config/nav) are misrouted if
        // queued or steered mid-turn — the shell dispatcher below is the only
        // thing that actually handles them, and it only runs when idle.
        // Mid-turn, block with a toast (kimi's toast() on InputAction.IGNORED)
        // instead of silently queueing something that will error later.
        if (line.startsWith('/') && state.turnActive) {
            ui.toast(`/${line.slice(1).split(/\s+/)[0]} is not available during streaming`)
            return
        }

        if (line.startsWith('/')) {
            const parts = line.slice(1).split(/\s+/)
            const name = resolveCommand('/' + parts[0]) || parts[0]
            const handler = HANDLERS[name]
            if (!handler) { ui.note(`unknown command: /${parts[0]}`, style.yellow); return }
            try { const out = await handler(state, parts.slice(1)); if (out) ui.note(out) }
            catch (e) { ui.note(`error: ${e.message}`, style.red) }
            if (name === 'clear') transcript.clear()
            if (name === 'resume') ui.renderHistory()
            ui.refresh()
            if (state.exit) ui.quit()
            return
        }

        // Mid-turn input QUEUES for after the turn (kimi 1.31's Enter
        // channel); ctrl+s steers immediately. Approvals/questions are
        // answered through their own channels above, not as prompt text.
        if (state.turnActive) {
            queueTurn(state.session, line)
            state.queuedMessages.push(line)
            ui.note(`  ❯ ${line}`, style.dim)
            ui.note('  [queued — runs after this turn; ctrl+s to steer now, ↑ to recall]', style.dim)
            ui.refresh()
            return
        }

        await runPrompt(line)
    }

    // One full turn: persist the prompt, stream progress/deltas into the
    // transcript, run, render. Drains the follow-up queue at the end.
    async function runPrompt(line) {
        ui.addUserLine(line)
        await appendMessage(state.session, { role: 'user', content: line })

        // Live turn surface — the same wire events the REPL subscribes to.
        const toolLines = new Map()
        const subagentLines = new Map()
        let assistantMd = null
        let assistantAcc = ''
        let sawDelta = false
        const openAssistant = () => {
            if (assistantMd) return
            transcript.addChild(new Text(style.dim(skin.branding.response_label.trim()), 1, 1))
            assistantMd = new Markdown('', 1, 0, markdownTheme)
            transcript.addChild(assistantMd)
        }
        const unsub = subscribeTurn(state.session, (env) => {
            if (env.event === 'assistant.delta') {
                sawDelta = true
                assistantAcc += env.data.text || ''
                openAssistant()
                assistantMd.setText(assistantAcc)
            } else if (env.event === 'tool.start') {
                const l = new Text(style.dim(`  ⠿ ${env.data.name} ${summarizeArgs(env.data.args)}`), 1, 0)
                toolLines.set(env.data.toolCallId, { line: l, name: env.data.name })
                transcript.addChild(l)
            } else if (env.event === 'tool.end') {
                const t = toolLines.get(env.data.toolCallId)
                if (t) t.line.setText(style.dim(`  ${env.data.denied ? '✗' : '✓'} ${t.name}${env.data.denied ? ' (denied)' : ''}`))
            } else if (env.event === 'subagent.spawn') {
                const l = new Text(style.dim(`  >> [${env.data.subagent_type}] ${env.data.description || env.data.agent_id} ${env.data.background ? '(background)' : ''}`), 1, 0)
                subagentLines.set(env.data.agent_id, l)
                transcript.addChild(l)
            } else if (env.event === 'subagent.end') {
                const l = subagentLines.get(env.data.agent_id)
                if (l) {
                    const mark = env.data.status === 'completed' ? 'OK' : env.data.status === 'timed_out' ? 'TIMEOUT' : 'FAIL'
                    l.setText(style.dim(`  [${mark}] [${env.data.subagent_type}] ${env.data.agent_id} - ${env.data.status}`))
                }
            } else if (env.event === 'approval.request') {
                ui.askApproval(env.data)
            } else if (env.event === 'steer.append') {
                ui.note(`  [steer] ${env.data.text}`)
            }
            tui.requestRender()
        })
        state.turnActive = true
        ui.setBusy(true)
        try {
            const out = await runTurn({
                prompt: line,
                messages: state.messages,
                callLLM,
                timeoutMs: 600000,
                sessionKey: state.session,
                cwd: process.cwd(),
                approvalMode: state.approvalMode,
                // Foreground surface: a present human never gets
                // auto-rejected (kimi 1.40 reversal).
                approvalTimeoutMs: Infinity,
                disabledToolsets: state.planMode ? PLAN_DISABLED : undefined,
                // ask_user_question stays schema-visible here because a
                // channel exists (elsewhere the machine hides the tool).
                toolCtx: {
                    askUser: (questions) => new Promise((resolve) => {
                        state.pendingAsk = { questions, answers: {}, i: 0, resolve }
                        ui.showAskQuestion()
                    }),
                },
            })
            state.messages = out.messages
            const reply = out.result || out.error || '(no response)'
            // Deltas already streamed the reply live; only render it whole
            // when the turn took the non-streaming path.
            if (!sawDelta) ui.addAssistantBlock(reply)
            await appendMessage(state.session, { role: 'assistant', content: reply })
        } catch (e) {
            ui.note(`error: ${e.message}`, style.red)
        } finally {
            state.turnActive = false
            ui.setBusy(false)
            try { unsub() } catch { /* swallow: listener already gone */ }
        }
        // Queued follow-ups (typed mid-turn) run next, in order.
        for (const q of drainQueue(state.session)) await runPrompt(q)
    }

    return { onLine, runPrompt, steerNow }
}
