import { fuzzyMatch as helper } from '../../src/utils.js'
export const _tool = ({
    name: 'fuzzy_match',
    toolset: 'core',
    schema: { name: 'fuzzy_match', description: 'Score a candidate string against a needle. Returns 0 for no match, higher for better match.', parameters: { type: 'object', properties: { needle: { type: 'string' }, haystack: { type: 'string' } }, required: ['needle', 'haystack'] } },
    handler: async ({ needle, haystack }) => ({ score: helper(needle, haystack) }),
})
