## Rationale

- `src/index.js` `bundledSkillDir`: the environment bundled root is a default root; an isolated provider (`includeDefaultRoots` false) must see only its explicit roots, otherwise every such provider would re-discover the app's bundled skills under its own provider name.
- `src/index.js` watcher health: a child unlink can publish an empty catalog before the root `unlinkDir` arrives, so discovery revalidates the retained handle independently of watcher events.
- `src/index.js` chokidar options: chokidar owns late native `fs.watch` errors only for persistent watchers; this provider's effect closes every handle explicitly at teardown.
- `src/index.js` watcher-restart failures are swallowed on retry and teardown because watch startup already logged the underlying failure; the next incomplete discovery retries again.
- TODO(file-watch-service): extract the chokidar and missing-root observation in `openStableWatcher` into a Cordis service; keep skill filtering and invalidation in this package.
