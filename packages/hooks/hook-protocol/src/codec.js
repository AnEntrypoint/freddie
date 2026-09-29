const BLOCKING_EXIT_CODE = 2

function str(obj, key) {
  const v = obj[key]
  return typeof v === 'string' ? v : undefined
}

function bool(obj, key) {
  const v = obj[key]
  return typeof v === 'boolean' ? v : undefined
}

function obj(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : undefined
}

function topLevelDecisionOf(value) {
  return value === 'approve' || value === 'block' ? value : undefined
}

function permissionDecisionOf(value) {
  return value === 'allow' || value === 'deny' || value === 'ask' ? value : undefined
}

export function parseHookOutput(exitCode, stdout, stderr, expectedEventName) {
  const trimmedErr = stderr.trim()
  const trimmedOut = stdout.trim()
  const output = { exitCode, stderr: trimmedErr, stdout: trimmedOut }

  if (exitCode === BLOCKING_EXIT_CODE) {
    output.decision = 'block'
    if (trimmedErr.length > 0) output.reason = trimmedErr
  }

  if (exitCode === 0) {
    if (trimmedOut.startsWith('{')) {
      let parsed
      try {
        parsed = obj(JSON.parse(trimmedOut))
      } catch {
        parsed = undefined
      }
      if (parsed) applyStructured(output, parsed, expectedEventName)
    }
  }

  return output
}

function applyStructured(output, parsed, expectedEventName) {
  const cont = bool(parsed, 'continue')
  if (cont !== undefined) output.continue = cont
  const stopReason = str(parsed, 'stopReason')
  if (stopReason !== undefined) output.stopReason = stopReason
  const sysMsg = str(parsed, 'systemMessage')
  if (sysMsg !== undefined) output.systemMessage = sysMsg

  const topDecision = topLevelDecisionOf(str(parsed, 'decision'))
  if (topDecision !== undefined) output.decision = topDecision
  const topReason = str(parsed, 'reason')
  if (topReason !== undefined) output.reason = topReason

  const hso = obj(parsed.hookSpecificOutput)
  if (hso) {
    const eventName = str(hso, 'hookEventName')
    if (eventName !== undefined) output.hookEventName = eventName
    if (expectedEventName !== undefined && eventName !== expectedEventName) {
      return
    }
    const permission = permissionDecisionOf(str(hso, 'permissionDecision'))
    if (permission !== undefined) output.decision = permission
    const permissionReason = str(hso, 'permissionDecisionReason')
    if (permissionReason !== undefined) output.reason = permissionReason
    const addCtx = str(hso, 'additionalContext')
    if (addCtx !== undefined) output.additionalContext = addCtx
    const updated = obj(hso.updatedInput)
    if (updated !== undefined) output.updatedInput = updated
  }
}
