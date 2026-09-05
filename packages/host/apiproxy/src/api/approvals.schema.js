/**
 * approvals domain plain pass-through helpers (zod validation removed by design;
 * malformed requests now fail differently downstream instead of being rejected here).
 */

/** Approval answer payload (the result.value slot of a client-response); no validation. */
export const toApprovalResponsePayload = (value) => value
