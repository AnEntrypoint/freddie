// Plan mode state — in-memory, browser-compatible
// Per-session plan mode tracking

const _planMode = new Map(); // sessionId -> boolean
const _planFiles = new Map(); // sessionId -> plan file path

/** @type {function(): string} */
let _getFreddieHome = null;

/**
 * Set the freddie home getter (called at plugin registration time)
 * @param {function(): string} fn
 */
export function setFreddieHomeGetter(fn) {
  _getFreddieHome = fn;
}

/**
 * @param {string} sessionId
 * @returns {boolean}
 */
export function isPlanMode(sessionId) {
  return _planMode.get(sessionId) === true;
}

/**
 * @param {string} sessionId
 */
export function enterPlanMode(sessionId) {
  _planMode.set(sessionId, true);
}

/**
 * @param {string} sessionId
 */
export function exitPlanMode(sessionId) {
  _planMode.set(sessionId, false);
}

/**
 * Simple path join — concatenates segments with '/' and normalizes.
 * Replaces node:path for browser compatibility.
 * @param {...string} segments
 * @returns {string}
 */
function joinPath(...segments) {
  return segments
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '') || '/'
}

/**
 * Get the plan file path for a session.
 * In Node.js, resolves to <FREDDIE_HOME>/plans/<sessionId>.md
 * In browser, returns a virtual path — the caller must handle writing.
 *
 * @param {string} sessionId
 * @returns {string}
 */
export function getPlanFilePath(sessionId) {
  if (_planFiles.has(sessionId)) return _planFiles.get(sessionId);

  let path;
  if (_getFreddieHome) {
    const home = _getFreddieHome();
    path = joinPath(home, 'plans', `${sessionId}.md`);
  } else {
    // Browser fallback — virtual path
    path = `/plans/${sessionId}.md`;
  }

  _planFiles.set(sessionId, path);
  return path;
}

/**
 * @param {string} sessionId
 * @param {string} planPath
 */
export function setPlanFilePath(sessionId, planPath) {
  _planFiles.set(sessionId, planPath);
}

/**
 * Reset all state for a session
 * @param {string} sessionId
 */
export function resetPlanState(sessionId) {
  _planMode.delete(sessionId);
  _planFiles.delete(sessionId);
}

/**
 * Clear all state (for testing)
 */
export function resetAllPlanState() {
  _planMode.clear();
  _planFiles.clear();
}