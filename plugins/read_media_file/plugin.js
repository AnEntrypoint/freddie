import { readMediaFileTool } from './handler.js'

export default {
    name: 'read_media_file',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(readMediaFileTool)
    },
}