import z from '@freddie/schemastery'
import { defineTool } from '@freddie/freddie-tools'

export const name = 'tool-subagent-report'
export const inject = ['subagents', 'tools', 'systemPrompt']

const REPORT_SECTION_ORDER = 117

export const Config = z.object({
  reportDelivery: z.union(['quiet', 'next-step']).default('next-step'),
})

export function installReportTool(childCtx, ctx, delivery) {
  const disposeSection = childCtx.systemPrompt.section({
    name: 'tool:report',
    order: REPORT_SECTION_ORDER,
    text: 'Deliver your result with the report tool before you finish: call it once with a self-contained '
      + 'answer. The agent that started you shares your workspace but does not automatically receive your '
      + 'transcript, tool output, or reasoning, so a closing remark such as "done" leaves it nothing it can '
      + 'use. Report earlier as well whenever a partial finding changes what that agent should do next; '
      + 'reporting never ends your turn.',
  })
  let disposeTool
  try {
    disposeTool = childCtx.tools.register(defineTool({
      name: 'report',
      description:
        'Report selected content to the agent that started you. Call this once before you finish, with a '
        + 'self-contained final result, and earlier for progress or findings that change what that agent does '
        + 'next. That agent shares your workspace but does not automatically receive your transcript, tool '
        + 'output, or reasoning, so finishing your work is not itself a result. Reporting does not end your '
        + 'turn or finish your work, and only your direct parent receives it. A failed call may still have '
        + 'arrived, so do not blindly repeat it.',
      parameters: {
        output: {
          type: 'string',
          required: true,
          description: 'Actionable content for your parent; summarize conclusions and reference relevant shared paths.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            messageId: { type: 'string', required: true },
          },
        },
        render: (_args, value) => [{
          type: 'text',
          text: `report accepted by the agent that started you as message ${value.messageId}`,
        }],
      },
      async execute(args, exec) {
        const content = [{ type: 'text', text: args.output }]
        const messageId = await ctx.subagents.reportFrom(exec.agent, content, {
          delivery,
          signal: exec.signal,
        })
        return { messageId }
      },
    }))
  } catch (error) {
    try {
      disposeSection()
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'failed to register the report tool and roll back its prompt guidance',
      )
    }
    throw error
  }
  return () => {
    const failures = []
    for (const dispose of [disposeTool, disposeSection]) {
      try {
        dispose()
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'failed to revoke report tool and prompt registrations')
    }
  }
}

export function apply(ctx, config = {}) {
  const { reportDelivery } = Config(config)
  ctx.subagents.registerContinuableSetup(childCtx =>
    installReportTool(childCtx, ctx, reportDelivery))
}
