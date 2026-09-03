import { todoListTool } from './handler.js'

export default {
    name: 'todo',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(todoListTool)
    },
}