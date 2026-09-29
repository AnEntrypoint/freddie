import { defineTool } from '@freddie/freddie-tools'
import { computeHunkDiffs, diffsFromMeta } from './diff.js'
import { remediateFsError } from './error.js'
import { sessionResolveOptions } from './session-cwd.js'

export function parseWriteArgs(args) {
  if (args.file_path.trim().length === 0) throw new Error('file_path must be a non-empty string')
  return { filePath: args.file_path, content: args.content }
}

export function formatWriteOutput(displayPath, outcome) {
  const verb = outcome.operation === 'create' ? 'Created' : 'Updated'
  return `<path>${displayPath}</path>
<type>file</type>
<content>
${verb} file
</content>`
}

export function applyWriteTool(ctx, sandbox) {
  ctx.systemPrompt.section({
    name: 'tool:write',
    order: 101,
    text: 'Use the write tool to create files or completely replace file contents. Existing files are overwritten, so read an existing file first (the default fs-observation-policy requires it) and prefer edit for targeted changes.',
  })

  ctx.tools.register(defineTool({
    name: 'write',
    description: 'Create or fully replace a UTF-8 text file.',
    parameters: {
      file_path: { type: 'string', required: true, description: 'Path to write, resolved by the filesystem backend.' },
      content: { type: 'string', required: true, description: 'Full UTF-8 text content to write.' },
      ...sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {},
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          operation: { type: 'string', required: true, enum: ['create', 'update'] },
          before: {
            required: true,
            oneOf: [
              { type: 'string' },
              { type: 'null' },
            ],
          },
          after: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatWriteOutput(value.path, value) }],
      presentationMeta: (args, value) => ({
        diffs: value.before === null
          ? []
          : computeHunkDiffs(args.file_path, value.before, value.after)
            .map(({ path, oldText, newText }) => ({ path, oldText, newText })),
      }),
    },
    async execute(args, exec) {
      const input = parseWriteArgs(args)
      const sandboxPolicy = await sandbox.resolvePolicy('write', args, exec)
      const target = await ctx.fs.resolve(input.filePath, sessionResolveOptions(exec, input.filePath, sandboxPolicy?.workspaceRoot))
      const intent = await ctx.waterfall('fs/write-intent', target, exec, () => undefined)
      let outcome
      try {
        outcome = await ctx.fs.writeText(target, input.content, intent, exec.signal, sandboxPolicy)
      } catch (error) {
        throw remediateFsError(sandbox.mapError(error, sandboxPolicy))
      }
      ctx.emit('fs/observed', target, { kind: 'present', version: outcome.version }, exec)
      return {
        path: target.displayPath,
        operation: outcome.operation,
        before: outcome.before,
        after: outcome.after,
      }
    },
    presentCall(args) {
      return {
        card: 'diff',
        title: `Write ${args.file_path}`,
        diffs: [{ path: args.file_path, oldText: null, newText: args.content }],
        locations: [{ path: args.file_path }],
      }
    },
    presentResult(args, result) {
      if (result.isError) return undefined
      const diffs = diffsFromMeta(result.meta)
        ?? [{ path: args.file_path, oldText: null, newText: args.content }]
      return { card: 'diff', title: `Write ${args.file_path}`, diffs }
    },
  }))
}
