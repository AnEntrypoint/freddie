import { truncateToWidth } from '@earendil-works/pi-tui'
import { style } from './style.js'

// One-line status bar pinned under the editor (ready/busy, session, model,
// approval + plan mode). pi-tui's TruncatedText has no setText, hence this
// tiny custom component with a width-keyed render cache. Text is supplied
// by a getter so the bar always reflects live turn state.
export class StatusLine {
    #getText
    #cache = null
    #cacheWidth = -1
    constructor(getText) { this.#getText = getText }
    invalidate() { this.#cache = null; this.#cacheWidth = -1 }
    render(width) {
        if (this.#cache && this.#cacheWidth === width) return this.#cache
        const line = truncateToWidth(style.inverse(' ' + this.#getText() + ' '), width, '')
        this.#cache = [line]
        this.#cacheWidth = width
        return this.#cache
    }
}
