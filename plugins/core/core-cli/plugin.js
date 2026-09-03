import { registerDiagnosticsCommand } from '../../../src/cli/diagnostics.js'
import { registerAuthCommand } from './commands-auth.js'
import { registerWorkspaceCommands } from './commands-workspace.js'
import { registerRuntimeCommands } from './commands-runtime.js'
import { registerConfigCommands } from './commands-config.js'
import { registerDevtoolsCommands } from './commands-devtools.js'

export default {
    name: 'core-cli', surfaces: 'pi',
    register({ pi, host }) {
        const C = pi.cli.register.bind(pi.cli)
        registerDevtoolsCommands(C, host)
        registerConfigCommands(C)
        registerRuntimeCommands(C)
        registerAuthCommand(C)
        registerWorkspaceCommands(C)
        registerDiagnosticsCommand(C, host)
    },
}
