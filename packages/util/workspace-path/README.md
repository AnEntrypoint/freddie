# freddie-workspace-path

Browser-safe workspace path classification, resolution, and display helpers, plus the `freddie-resource://file/…` address grammar — no filesystem access, so it runs identically on the client and the host.

## Surface

```js
import {
  isAbsoluteWorkspacePath, resolveWorkspacePath, abbreviateHomePath,
  workspaceTitleOf, pathPartsOf, relativizeToCwd, fileAddressFor, parseFileAddress,
} from '@freddie/freddie-workspace-path'

isAbsoluteWorkspacePath('src/a.ts') // false
isAbsoluteWorkspacePath('C:\\x\\a.ts') // true (POSIX, Windows drive, and UNC all count)
resolveWorkspacePath('/work', 'src/a.ts') // '/work/src/a.ts'
abbreviateHomePath('/Users/u/Documents/project', '/Users/u') // '~/Documents/project'
pathPartsOf('/work/project/notes.md') // { directory: '/work/project/', name: 'notes.md' }
relativizeToCwd('/work/report.txt', '/work') // 'report.txt'

const address = fileAddressFor('session-1', '/work', 'src/a.ts')
// 'freddie-resource://file/session/session-1/src/a.ts'
parseFileAddress(address)
// { scope: 'session', sessionId: 'session-1', path: 'src/a.ts' }
```

`fileAddressFor` picks the address scope from what the caller holds: a relative path, or an absolute path inside the session's workspace, becomes a `session`-scoped address (resolved later against that session's own root); an absolute path outside it, or one whose workspace root is unknown, still gets a `session`-scoped address carrying its own absolute path unresolved — `dir/..`/`.` segments are never resolved by this module, only encoded and decoded losslessly. `absoluteFileAddress`/`sessionFileAddress`/`parseFileAddress` (re-exported from `file-address.js`) build and parse the grammar directly: every id and path segment is component-encoded (so `#`, `?`, and spaces survive), decoded exactly once (an already-percent-encoded segment like `%2e%2e` decodes to `..` literally, never resolved), and a malformed escape or unknown scope/scheme parses to `undefined` rather than throwing.

`fileMediaUrl(base, path)` addresses a decoded absolute path through the authenticated file route for an HTTP(S) or `freddie-app://app/` base; it returns `undefined` for a relative path, a UNC path, a control character, or an unsupported base rather than producing a broken URL.
