import { defineTool } from '@freddie/freddie-tools'
import { computeHunkDiffs, diffsFromMeta } from './diff.js'
import { remediateFsError } from './error.js'
import { sessionResolveOptions } from './session-cwd.js'

export function parseEditArgs(args) {
  if (args.file_path.trim().length === 0) throw new Error('file_path must be a non-empty string')
  if (args.old_string.length === 0) throw new Error('old_string must be a non-empty string')
  if (args.old_string === args.new_string) throw new Error('old_string and new_string must differ')
  return {
    filePath: args.file_path,
    oldString: args.old_string,
    newString: args.new_string,
    replaceAll: args.replace_all ?? false,
  }
}

export function formatEditOutput(displayPath, replaceAll) {
  return replaceAll
    ? `The file ${displayPath} has been updated. All occurrences were successfully replaced.`
    : `The file ${displayPath} has been updated successfully.`
}

export function applyEditTool(ctx, sandbox) {
  ctx.systemPrompt.section({
    name: 'tool:edit',
    order: 102,
    text: 'Use the edit tool for targeted changes to existing UTF-8 text files. It replaces literal old_string with new_string; by default old_string must appear exactly once. If old_string appears multiple times, provide a more specific old_string or set replace_all to true. Read the file first (the default fs-observation-policy requires it), unless you just created or edited it in this session.',
  })

  ctx.tools.register(defineTool({
    name: 'edit',
    description: 'Edit an existing UTF-8 text file by replacing literal text.',
    parameters: {
      file_path: { type: 'string', required: true, description: 'Path to edit, resolved by the filesystem backend.' },
      old_string: { type: 'string', required: true, description: 'Literal text to replace. Must match exactly.' },
      new_string: { type: 'string', required: true, description: 'Literal replacement text. Use an empty string to delete the match.' },
      replace_all: { type: 'boolean', description: 'Replace all matches. Defaults to false; when false, old_string must appear exactly once.' },
      ...sandbox.escalationModes.length > 0 ? sandbox.schemaFields() : {},
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          before: { type: 'string', required: true },
          after: { type: 'string', required: true },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: formatEditOutput(value.path, args.replace_all ?? false),
      }],
      presentationMeta: (args, value) => ({
        diffs: computeHunkDiffs(args.file_path, value.before, value.after)
          .map(({ path, oldText, newText }) => ({ path, oldText, newText })),
      }),
    },
    async execute(args, exec) {
      const input = parseEditArgs(args)
      const sandboxPolicy = await sandbox.resolvePolicy('edit', args, exec)
      const target = await ctx.fs.resolve(input.filePath, sessionResolveOptions(exec, input.filePath, sandboxPolicy?.workspaceRoot))
      let outcome
      try {
        const intent = await ctx.waterfall('fs/edit-intent', target, exec, () => undefined)
        outcome = await ctx.fs.editText(
          target,
          { oldString: input.oldString, newString: input.newString, replaceAll: input.replaceAll },
          intent,
          exec.signal,
          sandboxPolicy,
        )
      } catch (error) {
        throw remediateFsError(sandbox.mapError(error, sandboxPolicy))
      }
      ctx.emit('fs/observed', target, { kind: 'present', version: outcome.version }, exec)
      return {
        path: target.displayPath,
        before: outcome.before,
        after: outcome.after,
      }
    },
    presentCall(args) {
      return {
        card: 'diff',
        title: `Edit ${args.file_path}`,
        diffs: [{ path: args.file_path, oldText: args.old_string || null, newText: args.new_string }],
        locations: [{ path: args.file_path }],
      }
    },
    presentResult(args, result) {
      if (result.isError) return undefined
      const diffs = diffsFromMeta(result.meta)
      if (diffs === undefined) return undefined
      return { card: 'diff', title: `Edit ${args.file_path}`, diffs }
    },
  }))
}
