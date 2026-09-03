// Thin Container wrapper around ContextMinimap so app.js can addChild it
// exactly like any other pi-tui component -- the minimap IS the whole
// scrolling view now (no separate transcript, no side-by-side HStack split).
// The class itself is trivial; it exists only for the same reason
// minimap-layout.js's prior HStack version did: pi-tui's
// TuiBase.containsComponent(root, target) walk (used by focus/overlay-mount
// bookkeeping) requires `root instanceof Container` to find a component in
// the mounted tree -- a bare ContextMinimap instance (not itself a
// Container subclass) would be invisible to that walk. Populating
// `this.children` with the minimap keeps that walk working.
import { Container } from '@earendil-works/pi-tui'

export class MinimapLayout extends Container {
    #minimap

    constructor(minimap) {
        super()
        this.#minimap = minimap
        this.children = [minimap]
    }

    invalidate() {
        this.#minimap.invalidate()
    }

    render(width) {
        return this.#minimap.render(width)
    }
}

export function createMinimapLayout(minimap) {
    return new MinimapLayout(minimap)
}
