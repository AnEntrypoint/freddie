export const _tool = {
    name: 'run_flow',
    toolset: 'core',
    schema: {
        name: 'run_flow',
        description:
            'Preferred mechanism for multi-step tool graphs. Direct tool calls remain legal for single steps. ' +
            'Run a flow skill by name. Flow skills are SKILL.md files that contain a Mermaid or D2 flowchart. ' +
            'The flowchart is walked from BEGIN to END, feeding each node to the LLM with path history, prior results, and remaining blanks. ' +
            'Mark unknowns as {{name}} or {{name:hint}}; they are filled by the same LLM only when that node is visited ' +
            '(output <blank name="name">value</blank>). ' +
            'Decision nodes must output <choice>value</choice> to select the branch. ' +
            'Task and decision nodes may emit tool_calls; the runner dispatches them via the host and feeds results back into the same node before advancing.',
        parameters: {
            type: 'object',
            properties: {
                name: {
                    type: 'string',
                    description: 'Exact skill name (findSkill match; no fuzzy lookup).',
                },
                args: {
                    type: 'string',
                    description: 'Optional arguments to pass to the flow skill.',
                },
                model: {
                    type: 'string',
                    description: 'Optional model override for the LLM calls within the flow.',
                },
                provider: {
                    type: 'string',
                    description: 'Optional provider override for the LLM calls within the flow.',
                },
            },
            required: ['name'],
        },
    },
    handler: async (args, ctx) => {
        return await runFlowSkill({
            name: args.name,
            flowArgs: args.args || '',
            model: args.model || null,
            provider: args.provider || null,
            ctx,
            log: _log,
        })
    },
}

