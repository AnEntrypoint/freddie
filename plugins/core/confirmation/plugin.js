import { approvalTool } from './lib/approval.js'
import { slashConfirmTool } from './lib/slash_confirm.js'
import { interruptTool, setInterrupt, isInterrupted, clearInterrupt } from './lib/interrupt.js'

export default {
    name: 'confirmation',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(approvalTool)
        pi.tools.register(slashConfirmTool)
        pi.tools.register(interruptTool)
    },
}

export { setInterrupt, isInterrupted, clearInterrupt }
