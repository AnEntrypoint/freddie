import { getActiveSkin } from '../skin/engine.js'

// --- colors: raw ANSI helpers -------------------------------------------
const RESET = '\x1b[0m'
const FG = { red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37, gray: 90 }
const BG = { red: 41, green: 42, yellow: 43, blue: 44, magenta: 45, cyan: 46, white: 47 }
const ATTR = { bold: 1, dim: 2, italic: 3, underline: 4 }
function wrap(code, s) { return '\x1b[' + code + 'm' + s + RESET }
export const fg = Object.fromEntries(Object.entries(FG).map(([k, c]) => [k, (s) => wrap(c, s)]))
export const bg = Object.fromEntries(Object.entries(BG).map(([k, c]) => [k, (s) => wrap(c, s)]))
export const attr = Object.fromEntries(Object.entries(ATTR).map(([k, c]) => [k, (s) => wrap(c, s)]))
export function hex(h, s) {
    const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16)
    return '\x1b[38;2;' + r + ';' + g + ';' + b + 'm' + s + RESET
}
export function strip(s) { return String(s).replace(/\x1b\[[0-9;]*m/g, '') }

// --- banner ---------------------------------------------------------------
const ART = [
    '  _____ _           _   _     ',
    ' |_   _| |__   ___ | |_| |__  ',
    '   | | | _ \\ / _ \\| __| _ \\ ',
    '   | | | | | | (_)| |_| | | |',
    '   |_| |_| |_|\\___/ \\__|_| |_|',
]
export function renderBanner() {
    const skin = getActiveSkin()
    return ART.join('\n') + '\n' + skin.branding.welcome
}
export function printBanner(out = process.stdout) { out.write(renderBanner() + '\n') }

// --- curses: optional blessed-backed terminal UI ---------------------------
let _blessed = null
async function probe() { if (_blessed !== null) return _blessed; try { _blessed = await import('blessed') } catch { _blessed = false } return _blessed }

export async function launchCurses({ output } = {}) {
    const b = await probe()
    if (!b) return { error: 'blessed not installed; run: npm install blessed' }
    const blessed = b.default || b
    const screen = blessed.screen({ smartCSR: true, title: 'freddie' })
    const log = blessed.log({ top: 0, left: 0, width: '100%', height: '90%', scrollable: true, alwaysScroll: true })
    const input = blessed.textbox({ bottom: 0, left: 0, width: '100%', height: 3, inputOnFocus: true })
    screen.append(log); screen.append(input)
    screen.key(['C-c', 'q'], () => process.exit(0))
    screen.render()
    return { screen, log, input, render: () => screen.render(), close: () => screen.destroy() }
}

// --- cli_output: message/table/box formatting ------------------------------
export function info(msg) { return hex(getActiveSkin().colors.banner_text, msg) }
export function success(msg) { return hex('#22c55e', '[ok] ' + msg) }
export function warning(msg) { return hex('#fbbf24', '! ' + msg) }
export function error(msg) { return hex('#ef4444', '[x] ' + msg) }
export function box(title, body) {
    const line = '-'.repeat(Math.max(20, title.length + 4))
    return '+' + line + '+\n| ' + title + ' '.repeat(line.length - title.length - 1) + '|\n+' + line + '+\n' + body.split('\n').map(l => '| ' + l + ' '.repeat(Math.max(0, line.length - l.length - 1)) + '|').join('\n') + '\n+' + line + '+'
}
export function table(rows) {
    if (!rows.length) return ''
    const keys = Object.keys(rows[0])
    const widths = keys.map(k => Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length)))
    const sep = '+-' + widths.map(w => '-'.repeat(w)).join('-+-') + '-+'
    const head = '| ' + keys.map((k, i) => k.padEnd(widths[i])).join(' | ') + ' |'
    const body = rows.map(r => '| ' + keys.map((k, i) => String(r[k] ?? '').padEnd(widths[i])).join(' | ') + ' |').join('\n')
    return [sep, head, sep, body, sep].join('\n')
}
