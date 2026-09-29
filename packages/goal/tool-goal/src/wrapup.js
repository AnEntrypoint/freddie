const GROUNDING =
  'Report only what earlier rounds and tool results in this session actually establish; '
  + 'when a detail is not in the session, say so instead of inventing it. '

const TOOLS_REMAIN =
  'All tools remain available and nothing here forbids calling them. '

export function renderWrapupContext(objective, blockedReason) {
  const heading = `Objective: ${JSON.stringify(objective)}\n`
  const text = blockedReason === undefined
    ? '<goal_complete>\n'
      + heading
      + 'The goal is marked complete. '
      + TOOLS_REMAIN
      + 'Before writing the closing message, check whether in-spirit work for the user\'s request is '
      + 'still unfinished (cleanup, follow-on steps, verification, leftovers you named earlier); if so, '
      + 'keep working with tools now and verify each result, and only then close. When the request is '
      + 'fully closed, write the closing message: state the outcome, summarize what was done and how it '
      + 'was verified, and point to the concrete results (files, commits, or other artifacts). '
      + GROUNDING
      + 'Note anything the user should review or do next. Address the user directly.\n'
      + '</goal_complete>'
    : '<goal_blocked>\n'
      + heading
      + `Blocked: ${JSON.stringify(blockedReason)}\n`
      + 'The goal is marked blocked. '
      + TOOLS_REMAIN
      + 'Finish any unblocked in-spirit work with tools first. Then write the closing message: state '
      + 'what has been completed so far, describe the concrete blocking condition and what you tried, '
      + 'and say exactly what you need from the user to continue. '
      + GROUNDING
      + 'Address the user directly.\n'
      + '</goal_blocked>'
  return [{ type: 'text', text }]
}
