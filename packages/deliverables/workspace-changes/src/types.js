/**
 * Per-turn workspace change summaries, the Session event announcing them, and the Host service
 * serving them with their comparisons. Pure compile-time type documentation (JSDoc typedefs only,
 * no runtime exports) — buildless plain JS carries no separate `.d.ts` output, so these typedefs are
 * the single source other modules' JSDoc `@typedef`/`@param` annotations reference.
 *
 * @typedef {object} WorkspaceChangedFile
 *   One file changed during a turn, with line counts from git or from the whole-file captures
 *   around its file-tool edits.
 * @property {string} path - Path relative to the Session working directory, or an absolute Host path outside it.
 * @property {string} display - Sort key and label: the relative path inside the working directory, a
 *   `../` path for repository files above it, a `~` path under the home directory, otherwise the
 *   absolute path. Always slash-separated.
 * @property {number} added - Lines added; zero for a binary or oversized file.
 * @property {number} deleted - Lines deleted; zero for a binary or oversized file.
 * @property {true} [binary] - Present when git reported the file as binary, or when a captured side holds a NUL byte.
 * @property {true} [oversized] - Present when a captured side exceeded the plugin's `maxFileBytes`; the file is listed without counts or comparison.
 *
 * @typedef {object} WorkspaceChangesSummary
 *   Files changed during one top-level turn, kept on the Host until its Session is disposed.
 * @property {number} turn - The turn whose file changes this summary describes.
 * @property {string} cwd - The Session working directory `path` values are relative to.
 * @property {WorkspaceChangedFile[]} files - Changed files in `display` order, capped at the plugin's `maxFiles`.
 * @property {number} total - Complete changed-file count, including files omitted by the cap.
 * @property {number} added - Lines added over every changed file, including files omitted by the cap.
 * @property {number} deleted - Lines deleted over every changed file, including files omitted by the cap.
 * @property {{ before: string; after: string }} [snapshot] - Git tree ids of the turn-start and turn-end snapshots; absent when no snapshot was taken.
 *
 * @typedef {object} WorkspaceDiffHunk
 *   One unified-diff hunk with three context lines; every line keeps its `+`, `-`, or space prefix.
 * @property {number} oldStart - First line of the hunk in the turn-start content, 1-based; a side without lines starts at 1 with zero lines.
 * @property {number} oldLines - Lines of the hunk taken from the turn-start content.
 * @property {number} newStart - First line of the hunk in the turn-end content, 1-based; a side without lines starts at 1 with zero lines.
 * @property {number} newLines - Lines of the hunk taken from the turn-end content.
 * @property {string[]} lines - Hunk body in order, each line prefixed with `+`, `-`, or a space.
 *
 * @typedef {{ kind: 'text'; path: string; display: string; before: boolean; after: boolean; hunks: WorkspaceDiffHunk[]; coarse: boolean } | { kind: 'binary'; path: string; display: string } | { kind: 'oversized'; path: string; display: string }} WorkspaceFileDiff
 *   The comparison of one listed file's turn-start and turn-end contents, computed when asked for.
 *   `text` carries whether the file existed at turn start/end, hunks in file order (empty when both
 *   sides hold the same lines), and whether the line comparison exceeded the timeout (`coarse`, every
 *   line shown as replaced). `binary`/`oversized` serve no lines.
 *
 * @typedef {object} WorkspaceChanges
 *   Serves the summaries and file comparisons the recorder keeps for live Sessions.
 * @property {(sessionId: import('@freddie/freddie-session').SessionId, seq: number) => WorkspaceChangesSummary | undefined} summary -
 *   The summary announced by one `workspace/changes` event, or undefined once its Session was
 *   disposed or when this Host never recorded it.
 * @property {(sessionId: import('@freddie/freddie-session').SessionId, seq: number, index: number, signal: AbortSignal) => Promise<WorkspaceFileDiff | undefined>} diff -
 *   Compare one listed file's contents at turn start and turn end; undefined once its Session was
 *   disposed, when this Host never recorded it, or when no file has that index.
 */
