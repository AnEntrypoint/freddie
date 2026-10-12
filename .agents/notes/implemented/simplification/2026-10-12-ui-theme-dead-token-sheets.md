# ui-theme dead-token sheets

Row: `freddie-client-bundle-weight`.

## Served bytes

The Web client loads each plugin's client closure as separate files (`packages/client/modules/src/index.js`, `scanClientTree`). `ui-theme` is `immediately: true`, so its closure is preloaded on every Web boot. Its five theme sheets ship as `export default "<css>"` modules, which `installThemeStyles` injects as `<style>` text.

Before: `design-platform.css.js` 19816 B, `gradient-shadow-text.css.js` 10507 B (30323 B together). ui-theme closure 45545 B.
After: 10869 B and 1816 B (12685 B together). ui-theme closure 27907 B.

## What was removed

- 216 custom properties with no consumer. Proof: a regex sweep of `--(dsw|freddie)-*` across the repo (2072 lines), then a liveness closure over `var()` references. A property is live only if a non-definition occurrence outside the sheet references it, or a live declaration in the sheets references it. Dead families: unused `--dsw-static-*` palette steps, the `--dsw-font-markdown-*-font-*` longhands (the shorthands read `--dsw-font-family` directly), and the other unused scale steps.
- 49 `body[data-ds-dark-theme]` declarations that repeated the light `body` value. The cascade winner for every remaining token is unchanged in both states (checked by resolving winners before and after).
- One rule block emptied by the above.

## Kept on purpose

- `--dsw-font-markdown-code-block-small*`: `ui-theme/AGENTS.md` says these are hand-added and a re-export must keep them.
- `.css` and `.css.js` stay byte-mirrored (`export default JSON.stringify(css)`).
- No whitespace minification: the `.css` file is the plugin export source, and minifying the mirror would diverge it from that source.

## Consumers

`src/client/styles.js` imports all five `.css.js` modules. No other file imports the two changed modules. Removed tokens are not referenced by `overrideTokens` callers in this repo (the token-name prefix search found only the `--freddie-alias-` guard message).
