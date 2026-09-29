/**
 * Browser terminal identities, metadata, and screen-stream frames.
 * @module @freddie/freddie-terminal-controller/types
 */

/**
 * A terminal identity scoped to one Session and one Host lifetime.
 * @typedef {string} WebTerminalId
 */

/**
 * An attachment allowed to write and resize one terminal.
 * @typedef {string} TerminalAttachmentId
 */

/**
 * Acknowledges one physical window hold without taking screen or input control.
 * @typedef {{ readonly type: 'retained' }} TerminalRetentionFrame
 */

/**
 * An executable shell verified through the subprocess provider.
 * @typedef {{ readonly path: string, readonly args: readonly string[], readonly name: string }} TerminalShell
 */

/**
 * Working directory and limits shared by new and restored terminals.
 * @typedef {{
 *   readonly cwd: string,
 *   readonly maxInputBytes: number,
 *   readonly maxCols: number,
 *   readonly maxRows: number,
 *   readonly scrollback: number
 * }} TerminalEnvironment
 */

/**
 * Host-owned terminal state; process exit never creates a replacement shell.
 * @typedef {{
 *   readonly id: WebTerminalId,
 *   readonly title: string,
 *   readonly shell: TerminalShell,
 *   readonly cwd: string,
 *   readonly cols: number,
 *   readonly rows: number,
 *   readonly state: 'running' | 'exited' | 'failed',
 *   readonly exitCode: number | null,
 *   readonly error?: string,
 *   readonly controllerId?: TerminalAttachmentId
 * }} WebTerminalInfo
 */

/**
 * Create is idempotent for an open identity; closed identities cannot be recreated.
 * @typedef {{
 *   readonly shellPath?: string,
 *   readonly id: WebTerminalId,
 *   readonly cols: number,
 *   readonly rows: number
 * }} TerminalCreateRequest
 */

/**
 * @typedef {{
 *   readonly type: 'snapshot',
 *   readonly sequence: number,
 *   readonly screen: string,
 *   readonly info: WebTerminalInfo
 * }} TerminalSnapshotFrame
 */

/**
 * @typedef {{
 *   readonly type: 'output',
 *   readonly sequence: number,
 *   readonly data: string
 * }} TerminalOutputFrame
 */

/**
 * @typedef {{ readonly type: 'state', readonly info: WebTerminalInfo }} TerminalStateFrame
 */

/**
 * An explicit cleanup intent that outlives its removed tab and any page reload.
 * @typedef {{
 *   readonly sessionId: string,
 *   readonly id: WebTerminalId,
 *   readonly title: string
 * }} TerminalCloseRequest
 */

/**
 * @typedef {TerminalSnapshotFrame | TerminalOutputFrame | TerminalStateFrame} TerminalFrame
 */

export {}
