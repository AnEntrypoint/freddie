import { getActiveSkin } from '../skin/engine.js'
import { hex } from './colors.js'
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
