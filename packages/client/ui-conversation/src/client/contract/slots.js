

export class PendingApproval {

  constructor(wait) {
    this.wait = wait
  }

  get key() {
    return this.wait.key
  }

  get toolName() {
    return this.wait.payload.toolName
  }

  get reason() {
    return this.wait.payload.reason
  }

  get callId() {
    return this.wait.payload.callId
  }

  async answer(outcome) {
    const receipt = await this.wait.respond({
      ok: true,
      value: { sessionId: this.wait.sessionId, approvalId: this.wait.payload.approvalId, outcome },
    })
    if (!receipt.accepted) {
      throw new Error(`approval response rejected: ${receipt.reason}`)
    }
  }
}
