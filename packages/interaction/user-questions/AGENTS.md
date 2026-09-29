# AGENTS.md — user-questions

## Rationale

- `src/index.js` request validation: a presentation `intent` asserts what types cannot, that the `approve` label is one of the question's own options and that a plan-review carries its plan. A UI honouring a bad intent would present a choice the asker never offered or an approval of something invisible, so `UserQuestionError` is thrown at the asker rather than in each UI.
