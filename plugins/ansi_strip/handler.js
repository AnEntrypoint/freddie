import { ansiStrip } from '../../src/utils.js'
export const _tool = ({
    name: 'ansi_strip',
    toolset: 'core',
    schema: { name: 'ansi_strip', description: 'Strip ANSI escape sequences.', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    handler: async ({ text }) => ({ text: ansiStrip(text) }),
})
