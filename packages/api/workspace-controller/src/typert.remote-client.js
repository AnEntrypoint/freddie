import { z } from 'zod'

const PACKAGE = '@freddie/freddie-api-workspace-controller'
const SOURCE = 'packages/api/workspace-controller/src/index.js'

const workspace = z.object({
  workspaceId: z.string(),
  path: z.string(),
  title: z.string(),
  sessionIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})
const directoryRow = z.object({ name: z.string(), path: z.string(), hidden: z.boolean() })

const workspaceList = z.object({
  workspaces: z.array(workspace),
  archivedSessionIds: z.array(z.string()),
})
const oneWorkspace = z.object({ workspace })
const deleted = z.object({ deleted: z.boolean() })
const workspaceOrder = z.object({ workspaceIds: z.array(z.string()) })
const archivedSessions = z.object({ archivedSessionIds: z.array(z.string()) })
const pickedPath = z.object({ path: z.string().nullable() })
const directoryListing = z.object({
  path: z.string(),
  home: z.string(),
  crumbs: z.array(directoryRow),
  entries: z.array(directoryRow),
  truncated: z.boolean(),
})
const createdDirectory = z.object({ path: z.string() })

const id = z.string().min(1)

const listRequest = undefined
const createRequest = z.object({ path: z.string().min(1), title: z.string().optional() })
const renameRequest = z.object({ workspaceId: id, title: z.string() })
const deleteRequest = z.object({ workspaceId: id })
const insertBeforeRequest = z.object({ workspaceId: id, beforeId: id.optional() })
const insertSessionBeforeRequest = z.object({
  workspaceId: id, sessionId: id, beforeSessionId: id.optional(),
})
const archiveSessionRequest = z.object({ sessionId: id })
const browseListRequest = z.object({ path: z.string().optional() })
const createDirectoryRequest = z.object({ path: z.string().min(1), name: z.string().min(1) })

function result(schema) {
  return z.union([
    z.object({ ok: z.literal(true), value: schema }),
    z.object({
      ok: z.literal(false),
      error: z.object({ code: z.string(), message: z.string() }).passthrough(),
    }),
  ])
}

function descriptor(service, namespace, method, request, value, cancellation = false) {
  return {
    id: `${PACKAGE}#${namespace}/${method}`,
    service,
    namespace,
    method,
    invocation: { kind: 'direct' },
    parameters: request === undefined
      ? []
      : [{
        name: 'request',
        wire: 'request',
        source: 'json',
        codec: {
          mode: 'strict',
          typeSymbol: `${PACKAGE}#${namespace}/${method}:request`,
          schema: request,
        },
      }],
    ...cancellation ? { cancellation: { parameter: 'signal' } } : {},
    result: {
      mode: 'strict',
      typeSymbol: `${PACKAGE}#${namespace}/${method}:result`,
      schema: result(value),
    },
    sourceLocation: { file: SOURCE, line: 1, column: 1 },
  }
}

export const TYPERT_REMOTE = {
  package: PACKAGE,
  descriptors: [
    descriptor('workspaceController', 'workspace', 'list', listRequest, workspaceList),
    descriptor('workspaceController', 'workspace', 'create', createRequest, oneWorkspace),
    descriptor('workspaceController', 'workspace', 'rename', renameRequest, oneWorkspace),
    descriptor('workspaceController', 'workspace', 'delete', deleteRequest, deleted),
    descriptor('workspaceController', 'workspace', 'insertBefore', insertBeforeRequest, workspaceOrder),
    descriptor('workspaceController', 'workspace', 'insertSessionBefore', insertSessionBeforeRequest, oneWorkspace),
    descriptor('workspaceController', 'workspace', 'archiveSession', archiveSessionRequest, archivedSessions),
    descriptor('directoryPickerController', 'directoryPicker', 'pick', undefined, pickedPath, true),
    descriptor('directoryPickerController', 'directoryPicker', 'list', browseListRequest, directoryListing, true),
    descriptor('directoryPickerController', 'directoryPicker', 'createDirectory', createDirectoryRequest, createdDirectory),
  ],
}

export default TYPERT_REMOTE
