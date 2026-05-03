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
