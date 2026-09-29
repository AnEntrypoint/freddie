import { defineTool } from './schema.js'

const CONTENT_VALUE_SCHEMA = { type: 'array', items: { type: 'json' } }

export function defineContentToolFixture(options) {
  const execute = options.execute
  return defineTool({
    ...options,
    output: {
      schema: CONTENT_VALUE_SCHEMA,
      render: (_args, value) => value,
    },
    async execute(args, exec) {
      return await execute(args, exec)
    },
  })
}
