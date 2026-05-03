import fs from 'node:fs'
import { getFreddieHome } from '../home.js'
export function uninstall({ keepData = true } = {}) {
    const home = getFreddieHome()
    const removed = []
    if (!keepData && fs.existsSync(home)) { fs.rmSync(home, { recursive: true, force: true }); removed.push(home) }
    return { removed, keepData, hint: 'npm uninstall -g freddie (or remove your local checkout)' }
}
