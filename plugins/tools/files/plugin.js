// Consolidated file-I/O plugin. Replaces 10 formerly-separate directories
// (read, write, edit, grep, file_operations, file_state, file_tools,
// patch_parser, fuzzy_match, binary_extensions) with one registration point.
//
// 7 tools register as before: read/write/edit/grep/file_operations/file_state/file_tools.
// patch_parser, fuzzy_match, and binary_extensions were never standalone
// concepts of their own -- they are libraries FOR the tools above (patch_parser
// and fuzzy_match are used directly by the edit tool's diff-apply and
// suggest-on-miss paths; binary_extensions is shared filter data) -- so they
// move to ./lib/*.js as internal modules, not tool registrations.
import { readTool } from './lib/read.js'
import { writeTool } from './lib/write.js'
import { editTool } from './lib/edit.js'
import { grepTool } from './lib/grep.js'
import { fileOperationsTool } from './lib/file_operations.js'
import { fileStateTool } from './lib/file_state.js'
import { fileToolsTool } from './lib/file_tools.js'

export default {
    name: 'files',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(readTool)
        pi.tools.register(writeTool)
        pi.tools.register(editTool)
        pi.tools.register(grepTool)
        pi.tools.register(fileOperationsTool)
        pi.tools.register(fileStateTool)
        pi.tools.register(fileToolsTool)
    },
}
