import { TYPERT_REMOTE } from './typert.remote-client.js'

export const TYPERT = {
  package: '@freddie/freddie-message-feedback',
  face: 'host',
  schemas: [
  ],
  invocations: TYPERT_REMOTE.descriptors,

  model: {
    "services": [
      {
        "description": "Storage-domain sidecar service. It inspects persisted Session history and never creates or resumes an Agent or Session.",
        "summary": "Storage-domain sidecar service.",
        "tags": [],
        "jsDoc": "/**\n * Storage-domain sidecar service. It inspects persisted Session history and\n * never creates or resumes an Agent or Session.\n */",
        "key": "messageFeedback",
        "exportName": "MessageFeedbackService",
        "members": [
          {
            "kind": "method",
            "name": "list",
            "signature": "@Remote('list') async list(request: MessageFeedbackListRequest): Promise<MessageFeedbackListResult>",
            "summary": "Read feedback belonging to the current persisted Session lifecycle.",
            "jsDoc": "/**\n * Read feedback belonging to the current persisted Session lifecycle.\n * A stale row from a reused Session id is invisible.\n * @param request - Session identity to inspect and list.\n * @returns current immutable items or `session-not-found`.\n */"
          },
          {
            "kind": "method",
            "name": "put",
            "signature": "@Remote('put') put(request: MessageFeedbackPutRequest): Promise<MessageFeedbackPutResult>",
            "summary": "Create or replace feedback for one derived append-origin assistant message.",
            "jsDoc": "/**\n * Create or replace feedback for one derived append-origin assistant\n * message. Every request must match the addressed item's current version;\n * a matching no-op returns the stored item without changing its revision.\n * @param request - target, desired value, and observed item version.\n * @returns the committed item or an explicit business failure.\n */"
          },
          {
            "kind": "method",
            "name": "delete",
            "signature": "@Remote('delete') delete(request: MessageFeedbackDeleteRequest): Promise<MessageFeedbackDeleteResult>",
            "summary": "Delete one feedback item.",
            "jsDoc": "/**\n * Delete one feedback item. Absence is successful regardless of the\n * supplied version; an existing item requires an exact version match.\n * @param request - Session, message, and observed item version.\n * @returns the stable absent postcondition, or an explicit failure.\n */"
          }
        ],
        "types": [
          {
            "name": "Branded",
            "declaration": "export type Branded<B extends string> = string & { readonly [BRAND]: B; };"
          },
          {
            "name": "MessageFeedbackDeleteRequest",
            "declaration": "export interface MessageFeedbackDeleteRequest {\n    readonly sessionId: SessionId;\n    readonly messageId: MessageId;\n    readonly ifVersion: MessageFeedbackVersion;\n}"
          },
          {
            "name": "MessageFeedbackDeleteResult",
            "declaration": "export type MessageFeedbackDeleteResult = MessageFeedbackSuccess<MessageFeedbackDeleteValue> | MessageFeedbackRejected<MessageFeedbackSessionNotFound | MessageFeedbackVersionConflict>;"
          },
          {
            "name": "MessageFeedbackDeleteValue",
            "declaration": "export interface MessageFeedbackDeleteValue {\n    readonly absent: true;\n}"
          },
          {
            "name": "MessageFeedbackFailure",
            "declaration": "export type MessageFeedbackFailure = MessageFeedbackSessionNotFound | MessageFeedbackTargetNotFound | MessageFeedbackVersionConflict | MessageFeedbackNoteBlank | MessageFeedbackNoteTooLarge;"
          },
          {
            "name": "MessageFeedbackItem",
            "declaration": "export interface MessageFeedbackItem {\n    readonly messageId: MessageId;\n    readonly rating: MessageFeedbackRating;\n    readonly note?: string;\n    readonly version: MessageFeedbackVersion;\n    readonly createdAt: number;\n    readonly updatedAt: number;\n}"
          },
          {
            "name": "MessageFeedbackListRequest",
            "declaration": "export interface MessageFeedbackListRequest {\n    readonly sessionId: SessionId;\n}"
          },
          {
            "name": "MessageFeedbackListResult",
            "declaration": "export type MessageFeedbackListResult = MessageFeedbackSuccess<MessageFeedbackListValue> | MessageFeedbackRejected<MessageFeedbackSessionNotFound>;"
          },
          {
            "name": "MessageFeedbackListValue",
            "declaration": "export interface MessageFeedbackListValue {\n    readonly items: readonly MessageFeedbackItem[];\n}"
          },
          {
            "name": "MessageFeedbackNoteBlank",
            "declaration": "export interface MessageFeedbackNoteBlank {\n    readonly code: 'note-blank';\n}"
          },
          {
            "name": "MessageFeedbackNoteTooLarge",
            "declaration": "export interface MessageFeedbackNoteTooLarge {\n    readonly code: 'note-too-large';\n    readonly maxBytes: number;\n    readonly actualBytes: number;\n}"
          },
          {
            "name": "MessageFeedbackPutRequest",
            "declaration": "export interface MessageFeedbackPutRequest {\n    readonly sessionId: SessionId;\n    readonly messageId: MessageId;\n    readonly rating: MessageFeedbackRating;\n    readonly note?: string;\n    readonly ifVersion: MessageFeedbackVersion | null;\n}"
          },
          {
            "name": "MessageFeedbackPutResult",
            "declaration": "export type MessageFeedbackPutResult = MessageFeedbackSuccess<MessageFeedbackItem> | MessageFeedbackRejected<MessageFeedbackSessionNotFound | MessageFeedbackTargetNotFound | MessageFeedbackVersionConflict | MessageFeedbackNoteBlank | MessageFeedbackNoteTooLarge>;"
          },
          {
            "name": "MessageFeedbackRating",
            "declaration": "export type MessageFeedbackRating = 'positive' | 'negative';"
          },
          {
            "name": "MessageFeedbackRejected",
            "declaration": "export interface MessageFeedbackRejected<E extends MessageFeedbackFailure> {\n    readonly ok: false;\n    readonly error: E;\n}"
          },
          {
            "name": "MessageFeedbackSessionNotFound",
            "declaration": "export interface MessageFeedbackSessionNotFound {\n    readonly code: 'session-not-found';\n    readonly sessionId: SessionId;\n}"
          },
          {
            "name": "MessageFeedbackSuccess",
            "declaration": "export interface MessageFeedbackSuccess<T> {\n    readonly ok: true;\n    readonly value: T;\n}"
          },
          {
            "name": "MessageFeedbackTargetNotFound",
            "declaration": "export interface MessageFeedbackTargetNotFound {\n    readonly code: 'target-not-found';\n    readonly sessionId: SessionId;\n    readonly messageId: MessageId;\n}"
          },
          {
            "name": "MessageFeedbackVersion",
            "declaration": "export type MessageFeedbackVersion = Branded<'MessageFeedbackVersion'>;"
          },
          {
            "name": "MessageFeedbackVersionConflict",
            "declaration": "export interface MessageFeedbackVersionConflict {\n    readonly code: 'version-conflict';\n    readonly current: MessageFeedbackItem | null;\n}"
          },
          {
            "name": "MessageId",
            "declaration": "export type MessageId = Branded<'MessageId'>;"
          },
          {
            "name": "SessionId",
            "declaration": "export type SessionId = Branded<'SessionId'>;"
          }
        ]
      }
    ],
    "events": [],
    "objects": []
  },
}
