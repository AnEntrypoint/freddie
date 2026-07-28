// Goal plugin — registers goal tracking tools
import { createGoalTool, getGoalTool, updateGoalTool, setGoalBudgetTool } from './handler.js';

export default {
    name: 'goal',
    surfaces: 'pi',
    register({ pi }) {
        pi.tools.register(createGoalTool);
        pi.tools.register(getGoalTool);
        pi.tools.register(updateGoalTool);
        pi.tools.register(setGoalBudgetTool);
    },
};