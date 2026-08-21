import { readMediaFileTool } from './handler.js'

export default {
    name: 'read-media-file',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(readMediaFileTool)
    },
}