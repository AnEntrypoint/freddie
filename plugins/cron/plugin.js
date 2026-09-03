import { cronCreateTool, cronDeleteTool, cronListTool } from './handler.js'
export default {
    name: 'cron', surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(cronCreateTool)
        pi.tools.register(cronDeleteTool)
        pi.tools.register(cronListTool)
    },
}