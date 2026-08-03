// PTY witness child: boots the real TUI surface (launchTui) inside a PTY.
// Spawned by _verify-tui-pty.mjs — not run directly.
import { launchTui } from './src/tui/index.js'
await launchTui({})
process.exit(0)
