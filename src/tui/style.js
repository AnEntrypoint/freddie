// Zero-dependency ANSI styling for the TUI. chalk is NOT a freddie
// dependency (pi-tui lists it only as a devDependency), so styles are raw
// SGR sequences; NO_COLOR / dumb terminals get plain text.
const enabled = !process.env.NO_COLOR && process.env.TERM !== 'dumb'
const wrap = (open, close) => (s) => enabled ? `\x1b[${open}m${s}\x1b[${close}m` : String(s)

export const style = {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    italic: wrap(3, 23),
    underline: wrap(4, 24),
    strikethrough: wrap(9, 29),
    inverse: wrap(7, 27),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    blue: wrap(34, 39),
    magenta: wrap(35, 39),
    cyan: wrap(36, 39),
    gray: wrap(90, 39),
}
