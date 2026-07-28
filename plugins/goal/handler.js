// Goal tools — create_goal, get_goal, update_goal, set_goal_budget
import { createGoal, getGoal, updateGoal, setGoalBudget, clearGoal } from './state.js';

/**
 * Resolve the session key from the tool context.
 * Uses ctx.sessionKey (set by agent/machine.js in mergedToolCtx).
 * @param {object} ctx
 * @returns {string}
 */
function sessionId(ctx) {
    return ctx.sessionKey || ctx.sessionId || ctx.session?.id || 'default';
}

export const createGoalTool = {
    name: 'create_goal',
    toolset: 'core',
    schema: {
        name: 'create_goal',
        description: 'Create a goal for the current session. A goal defines a specific objective and completion criteria to guide the agent\'s work. Only one goal can be active per session.',
        parameters: {
            type: 'object',
            properties: {
                objective: {
                    type: 'string',
                    description: 'The objective of the goal — what should be accomplished.',
                },
                completionCriterion: {
                    type: 'string',
                    description: 'A clear, verifiable description of what it means for the goal to be complete.',
                },
                replace: {
                    type: 'boolean',
                    description: 'If true, replace any existing goal for this session.',
                },
            },
            required: ['objective'],
        },
    },
    handler: async (args, ctx) => {
        const sid = sessionId(ctx);
        try {
            const goal = createGoal(sid, {
                objective: args.objective,
                completionCriterion: args.completionCriterion,
                replace: args.replace,
            });
            return { ok: true, goal };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },
};

export const getGoalTool = {
    name: 'get_goal',
    toolset: 'core',
    schema: {
        name: 'get_goal',
        description: 'Get the current goal for this session. Returns null if no goal has been set.',
        parameters: {
            type: 'object',
            properties: {},
            required: [],
        },
    },
    handler: async (_args, ctx) => {
        const sid = sessionId(ctx);
        const goal = getGoal(sid);
        return { goal: goal || null };
    },
};

export const updateGoalTool = {
    name: 'update_goal',
    toolset: 'core',
    schema: {
        name: 'update_goal',
        description: 'Update the status of the current goal. Use this to mark the goal as completed, blocked, or active.',
        parameters: {
            type: 'object',
            properties: {
                status: {
                    type: 'string',
                    enum: ['active', 'completed', 'blocked'],
                    description: 'The new status for the goal.',
                },
            },
            required: ['status'],
        },
    },
    handler: async (args, ctx) => {
        const sid = sessionId(ctx);
        try {
            const goal = updateGoal(sid, { status: args.status });
            return { ok: true, goal };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },
};

export const setGoalBudgetTool = {
    name: 'set_goal_budget',
    toolset: 'core',
    schema: {
        name: 'set_goal_budget',
        description: 'Set a budget limit for the current goal. When the budget is exceeded, the goal will be marked as blocked.',
        parameters: {
            type: 'object',
            properties: {
                value: {
                    type: 'number',
                    description: 'The budget limit value.',
                },
                unit: {
                    type: 'string',
                    enum: ['turns', 'tokens', 'milliseconds', 'seconds', 'minutes', 'hours'],
                    description: 'The unit for the budget limit.',
                },
            },
            required: ['value', 'unit'],
        },
    },
    handler: async (args, ctx) => {
        const sid = sessionId(ctx);
        try {
            const goal = setGoalBudget(sid, { value: args.value, unit: args.unit });
            return { ok: true, goal };
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },
};