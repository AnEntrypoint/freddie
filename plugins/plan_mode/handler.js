// Plan mode tools — enter_plan_mode and exit_plan_mode
import { isPlanMode, enterPlanMode, exitPlanMode, getPlanFilePath } from './state.js';
import { telemetry } from '../../src/observability/telemetry.js';

// Browser-compatible file reader. Tries node:fs/promises first, falls back
// gracefully for browser environments where file system access is not available.
async function readPlanFile(planPath) {
  // In browser, the plan file is virtual — the model writes to it via the
  // write/edit tools, and we read it back from the virtual filesystem if
  // available (e.g. thebird's pyodide FS), or return a placeholder.
  try {
    // Check for browser virtual FS bridge first (thebird / dashboard).
    const g = (typeof globalThis !== 'undefined' ? globalThis : global)
    if (g && typeof g.__FREDDIE_READ_FILE__ === 'function') {
      return await g.__FREDDIE_READ_FILE__(planPath)
    }
    // Node.js: try native fs.
    const fs = await import('node:fs/promises')
    return await fs.readFile(planPath, 'utf-8')
  } catch {
    return '(plan file not found or not readable)'
  }
}

export const _enterPlanMode = {
  name: 'enter_plan_mode',
  toolset: 'core',
  schema: {
    name: 'enter_plan_mode',
    description: 'Enter plan mode. In plan mode, you can only use read-only tools and edit the plan file. Use this to plan your approach before writing code. Call exit_plan_mode when your plan is ready for review.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  handler: async (args, ctx) => {
    const sessionId = ctx.sessionId || ctx.session?.id || 'default';
    enterPlanMode(sessionId);
    const planPath = getPlanFilePath(sessionId);
    telemetry.planSubmitted({ session_id: sessionId, plan_file: planPath });
    return {
      ok: true,
      message: `Entered plan mode. Write your plan to ${planPath}. Use read-only tools to explore and edit the plan file. Call exit_plan_mode when ready.`,
      plan_file: planPath,
    };
  },
};

export const _exitPlanMode = {
  name: 'exit_plan_mode',
  toolset: 'core',
  schema: {
    name: 'exit_plan_mode',
    description: 'Exit plan mode and present your plan for approval. If you have multiple alternative approaches, provide them as options.',
    parameters: {
      type: 'object',
      properties: {
        options: {
          type: 'array',
          description: 'Optional alternative approaches (up to 3). Each with a label and optional description.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Short name for this option (1-8 words)' },
              description: { type: 'string', description: 'Brief summary of this approach and its trade-offs' },
            },
            required: ['label'],
          },
          maxItems: 3,
        },
      },
      required: [],
    },
  },
  handler: async (args, ctx) => {
    const sessionId = ctx.sessionId || ctx.session?.id || 'default';
    if (!isPlanMode(sessionId)) {
      return { ok: false, error: 'Not in plan mode. Call enter_plan_mode first.' };
    }

    const planPath = getPlanFilePath(sessionId);
    const planContent = await readPlanFile(planPath);

    // Present plan for approval via ctx.askUser or ctx.askApproval
    if (ctx.askUser) {
      const questions = [{
        question: 'Approve this plan?',
        header: 'Plan',
        options: [
          { label: 'Approve', description: 'Accept the plan and exit plan mode' },
          { label: 'Revise', description: 'Reject with feedback for revision' },
          { label: 'Reject and Exit', description: 'Reject the plan and exit plan mode' },
        ],
      }];

      if (args.options && args.options.length > 0) {
        questions[0].options = [
          ...args.options.map(o => ({
            label: o.label,
            description: o.description || '',
          })),
          { label: 'Revise', description: 'Reject with feedback for revision' },
          { label: 'Reject and Exit', description: 'Reject the plan and exit plan mode' },
        ];
      }

      try {
        const result = await ctx.askUser(questions);
        const answer = result.answers?.[questions[0].question] || 'Reject and Exit';

        if (answer === 'Approve' || args.options?.some(o => o.label === answer)) {
          exitPlanMode(sessionId);
          telemetry.planResolved({ session_id: sessionId, decision: 'approved', plan_file: planPath });
          return { ok: true, decision: 'approved', plan_file: planPath, plan_content: planContent.slice(0, 2000) };
        } else if (answer === 'Revise') {
          return { ok: true, decision: 'revised', feedback: 'Please revise the plan based on feedback and call exit_plan_mode again.' };
        } else {
          exitPlanMode(sessionId);
          telemetry.planResolved({ session_id: sessionId, decision: 'rejected', plan_file: planPath });
          return { ok: true, decision: 'rejected', message: 'Plan rejected. Plan mode exited.' };
        }
      } catch {
        // No interactive channel — auto-approve if config allows
        exitPlanMode(sessionId);
        telemetry.planResolved({ session_id: sessionId, decision: 'auto_approved', plan_file: planPath });
        return { ok: true, decision: 'approved', plan_file: planPath, auto_approved: true, plan_content: planContent.slice(0, 2000) };
      }
    }

    // No askUser available — exit with auto-approval
    exitPlanMode(sessionId);
    telemetry.planResolved({ session_id: sessionId, decision: 'auto_approved', plan_file: planPath });
    return { ok: true, decision: 'approved', plan_file: planPath, auto_approved: true, plan_content: planContent.slice(0, 2000) };
  },
};