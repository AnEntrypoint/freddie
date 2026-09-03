// Browsable session picker for --resume/-r/`/resume` with no explicit id --
// per direct user request, reuses the same one-line-per-row rendering
// convention and nav-mode interaction (up/down select, enter confirm, esc
// cancel) as context-minimap.js's own ctrl+o row browsing, rather than
// inventing a second UI pattern for what is structurally the same problem
// (pick one row out of many, each showing a short weight/preview summary).
import { truncateToWidth } from '@earendil-works/pi-tui'
import { sanitizeForPreview } from './context-minimap.js'
import { style } from './style.js'

function formatUpdatedAt(ms) {
    if (!Number.isFinite(ms)) return ''
    return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

// Fixed visible-row window (per direct user request: "resume menu should
// scroll too") -- render() always returns EXACTLY this many row lines plus
// one header line, regardless of how many sessions exist, so
// ui-helpers.js's clearSessionPickerNotices (which clears a fixed count of
// notice keys) never has to track a variable line count across scroll
// positions. Short lists (fewer than WINDOW rows) still render WINDOW
// blank-padded lines rather than a variable count, for the same reason.
const WINDOW = 10

// One row per session: id (short), message count, updated_at, and the last
// message's content truncated to fit -- the same "short id + weight/count +
// truncated preview, single line" shape context-minimap.js's own closed-row
// rendering uses, so browsing sessions feels like the same interaction as
// browsing turns within one session.
export class SessionPicker {
    #rows
    #selectedIndex = 0
    #scrollTop = 0

    constructor(rows) {
        this.#rows = rows
    }

    get rows() { return this.#rows }
    get selected() { return this.#rows[this.#selectedIndex] || null }
    // The fixed number of row-lines render() always produces -- ui-helpers.js
    // needs this to size its notice-key clearing loop (header + WINDOW rows),
    // not this.#rows.length (which no longer matches the rendered line count
    // once the list is windowed).
    static get WINDOW() { return WINDOW }

    moveSelection(delta) {
        const n = this.#rows.length
        if (!n) return
        this.#selectedIndex = ((this.#selectedIndex + delta) % n + n) % n
        // Keep the selection inside the visible window, scrolling the
        // minimum amount needed rather than always re-centering -- matches
        // ordinary terminal-menu scroll behavior (the view moves only when
        // the cursor would otherwise leave it).
        if (this.#selectedIndex < this.#scrollTop) this.#scrollTop = this.#selectedIndex
        else if (this.#selectedIndex >= this.#scrollTop + WINDOW) this.#scrollTop = this.#selectedIndex - WINDOW + 1
    }

    render(width) {
        const n = this.#rows.length
        const lines = []
        const rangeLabel = n > WINDOW ? ` (showing ${this.#scrollTop + 1}-${Math.min(this.#scrollTop + WINDOW, n)} of ${n})` : ` (${n})`
        lines.push(style.bold(`Resume which session?${rangeLabel} -- up/down select, enter confirm, esc cancel`))
        for (let slot = 0; slot < WINDOW; slot++) {
            const i = this.#scrollTop + slot
            const row = this.#rows[i]
            if (!row) { lines.push(''); continue }
            const isSelected = i === this.#selectedIndex
            const cursor = isSelected ? style.yellow('> ') : '  '
            const idLabel = style.cyan(row.id.slice(0, 8))
            const countLabel = style.dim(String(row.message_count ?? 0).padStart(4) + ' msgs')
            const whenLabel = style.dim(formatUpdatedAt(row.updated_at))
            const titleOrLast = row.title || (typeof row.last_content === 'string' ? row.last_content : '') || '(empty)'
            const preview = style.dim(sanitizeForPreview(String(titleOrLast)).replace(/\s+/g, ' ').trim())
            lines.push(truncateToWidth(`${cursor}${idLabel} ${countLabel} ${whenLabel}  ${preview}`, width, ''))
        }
        return lines
    }
}
