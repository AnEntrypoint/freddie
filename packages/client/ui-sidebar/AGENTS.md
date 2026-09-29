# client-ui-sidebar

## Rationale

- `src/client/SidebarRoot.js` `#bindPointerMove`: leaving the column is decided by its box (`getBoundingClientRect` on document `pointermove`), not DOM containment, and only while the scrollbars are drawn. `ui-settings-general` renders its full-viewport panel (`SettingsRoot.css`, `position: fixed; inset: 0`) as a descendant of this column, so moving onto that panel, or onto the conversation once it closes, fires no `pointerleave` here. The element's own `pointerleave` stays for a pointer leaving the window, which emits no further moves.
- `SidebarRoot.js` `#tooltip`: tooltips go through `renderTooltip(cached, props)`; `h(Tooltip, ...)` calls the one-shot `Tooltip(props)` factory (`ui-primitives/src/Tooltip.js`), which builds a new `freddie-tooltip` each render and drops its in-flight `#showTimer` hover delay.

## CSS rationale

- `SidebarRoot.css`: collapse is a slide plus crossfade, not a morph. The content holds its frozen expanded layout (inline width set by the component) and fades in place (`.fading`, 150ms) while the sliding AppFrame track clips it; the rail layout (`.collapsed`) applies only after the fade settles so nothing reflows mid-slide, the rail controls enter (`.railIn`) only on a live collapse (a cold collapsed render stays static), and the bottom-pinned settings seat shares their opacity timeline but stays horizontally fixed.
- `SidebarRoot.css` `.quietBars`: the shell adds it whenever the pointer is not inside (`SidebarRoot.js` owns the linger); rebinding ui-theme's thumb indirection pair to `transparent` hides the thumb in every nested scroll region. It uses `transparent`, not `display: none`, so the reservation (`scrollbar-gutter: stable` on the list) stays in force and revealing the thumb never reflows a row. The region seat is always mounted so the foot never moves; its trailing margin cancels the wide shell inset so the nested scrollbar sits at the sidebar edge.
