# freddie-code-language

Single file-extension to syntax-highlighting language table shared by every code surface: a document preview or diff review picking a highlighter grammar, and the read tool's persisted `lang` hint. Zero dependencies, table-driven, no filesystem access.

## Surface

```js
import { languageForPath, readLangHintForPath, CODE_HIGHLIGHT_EXTENSIONS } from '@freddie/freddie-code-language'

languageForPath('src/main.rs') // 'rust'
languageForPath('deploy.PS1') // 'powershell' (case-insensitive)
languageForPath('archive.tar.gz') // undefined (only the suffix after the last dot)
readLangHintForPath('src/a.tsx') // 'tsx' (short id the read tool persists)
readLangHintForPath('app.kt') // 'kotlin'
```

`languageForPath` returns the canonical grammar id a highlighter's alias table resolves; an unrecognized or absent extension returns `undefined`, which renders as plain text. `readLangHintForPath` projects a shorter persisted id over the same table — the language's short name for most extensions, with a handful of suffixes (`tsx`/`jsx`, `tf`/`tfvars`, `gradle`) keeping their own spelling because a recorded session already holds that exact value. `CODE_HIGHLIGHT_EXTENSIONS` lists every recognized suffix once, for a preview registry deciding whether to claim a file.

Both path separators are recognized and matching is case-insensitive, so `C:\dir\main.PS1` resolves like `dir/main.ps1`.
