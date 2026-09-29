# client-ui-plan

## Rationale

- Deliberately not localized: the failure strings in `src/client/index.js` (`exitPlanMode`) and `src/client/PlanModeControl.js` (`'failed to exit plan mode'`) stay English, and the chip wordmark `'Plan'` is a design literal that is identical in every locale.
