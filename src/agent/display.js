import { getActiveSkin } from '../skin/engine.js'

const FRAMES_PER_SECOND = 8

export function spinnerFrames() {
    const skin = getActiveSkin()
    return [...skin.spinner.waiting_faces, ...skin.spinner.thinking_faces]
}
export function activityPrefix() { return getActiveSkin().tool_prefix || '┊' }
export function renderActivity(line) { return `${activityPrefix()} ${line}` }
export function renderResponseLabel() { return getActiveSkin().branding.response_label }

export function startSpinner({ output = process.stdout, label = '' } = {}) {
    const frames = spinnerFrames()
    let i = 0
    const t = setInterval(() => {
        const f = frames[i++ % frames.length]
        output.write(`\r${f}  ${label}${' '.repeat(8)}`)
    }, Math.floor(1000 / FRAMES_PER_SECOND))
    return {
        stop() { clearInterval(t); output.write('\r' + ' '.repeat(40 + label.length) + '\r') },
    }
}
