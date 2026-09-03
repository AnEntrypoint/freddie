// Standalone glob tool plugin. Uses ripgrep (rg --files --glob) to find
// files matching a glob pattern, sorted by modification time, most recent
// first. Respects .gitignore by default.
import { globTool } from './handler.js'

export default {
    name: 'glob',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(globTool)
    },
}