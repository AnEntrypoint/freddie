# client-ui-plan

## Rationale

- Deliberately not localized: the failure strings in `src/client/index.js` (`exitPlanMode`) and `src/client/PlanModeControl.js` (`'failed to exit plan mode'`) stay English, and the chip wordmark `'Plan'` is a design literal that is identical in every locale.

- `PlanModeControl.js` renders the chip only while the effective target is plan mode (`pending ? !active : active`, a folded host value, not client optimism) and executes `/plan` off. Plan behavior (the `/plan` command, projection unit, policy section) lives in `@freddie/freddie-plan-mode`; this package holds no plan state.

- `src/invariant.js` installs nothing. No runtime invariant: plan state and boundary ownership are audited by freddie-plan-mode; the control is a slot effect.
