// Static text-level contract checks for plugin.js/handler.js source, reusing
// the REAL contract rules from src/host/contract.js's validatePlugin() --
// not reimplemented, just applied at the text level since an LSP diagnostic
// runs against unsaved editor content (which can't be dynamically import()ed
// the way plugin-validate-cli's file-argument model does). The SURFACES enum
// itself is imported directly from the real contract module so the two
// checks can never silently drift apart.
import { SURFACES } from '../../src/host/contract.js'

export function diagnosePluginSource(text, isHandlerFile) {
    const diagnostics = []
    const isPluginFile = /export\s+default\s*\{/.test(text) || /export\s+const\s+plugin\s*=/.test(text)

    if (isHandlerFile && !isPluginFile) {
        // handler.js: expects _tool/_tool0/_tool1... exports, per host.js's
        // real discoverPlugins() shape ({name, schema, handler}).
        const toolExports = [...text.matchAll(/export\s+const\s+(_tool\d*)\s*=/g)]
        if (!toolExports.length) {
            diagnostics.push({ severity: 'error', message: 'handler.js exports no recognizable tool shape (expected export const _tool = {name, schema, handler})' })
        }
        return diagnostics
    }

    if (!isPluginFile) return diagnostics // not a plugin.js-shaped file at all, nothing to check

    // name: string required
    if (!/name\s*:\s*['"`]/.test(text)) {
        diagnostics.push({ severity: 'error', message: "plugin.name: string required (found no name: '...' field)" })
    }

    // surfaces: must be one of the real SURFACES enum
    const surfaceMatch = text.match(/surfaces\s*:\s*['"`](\w+)['"`]/)
    if (!surfaceMatch) {
        diagnostics.push({ severity: 'error', message: `surfaces: required, must be one of ${SURFACES.join(',')}` })
    } else if (!SURFACES.includes(surfaceMatch[1])) {
        diagnostics.push({ severity: 'error', message: `surfaces: '${surfaceMatch[1]}' is not one of ${SURFACES.join(',')}`, index: surfaceMatch.index })
    }

    // register(ctx): function required
    if (!/register\s*[:(]/.test(text)) {
        diagnostics.push({ severity: 'error', message: 'register(ctx): function required (found no register field)' })
    }

    // requires: if present, must look like an array
    const requiresMatch = text.match(/requires\s*:\s*([^,\n}]+)/)
    if (requiresMatch && !/^\s*\[/.test(requiresMatch[1])) {
        diagnostics.push({ severity: 'error', message: 'requires: must be an array', index: requiresMatch.index })
    }

    return diagnostics
}

export const PLUGIN_JS_SNIPPET = `export default {
    name: '\${1:plugin-name}', surfaces: '\${2|pi,gui,both|}',
    register({ \${3:pi} }) {
        \${0}
    },
}
`

export const HANDLER_JS_SNIPPET = `export const _tool = ({
    name: '\${1:tool_name}',
    toolset: '\${2:core}',
    schema: { name: '\${1:tool_name}', description: '\${3:description}', parameters: { type: 'object', properties: {}, required: [] } },
    handler: async (\${4:args}) => {
        \${0}
    },
})
`
