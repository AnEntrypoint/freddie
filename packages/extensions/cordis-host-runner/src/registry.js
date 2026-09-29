export class DynamicCordisRegistry {
  plugins = new Map()
  pendingRequests = new Map()
  nextPlugin = 1
  nextPackage = 1
  nextRun = 1
  nextApproval = 1

  mintPluginId(prefix) {
    let id
    do id = `${prefix}-${this.nextPlugin++}`
    while (this.plugins.has(id))
    return id
  }

  mintPackageId() {
    return `pkg-${this.nextPackage++}`
  }

  mintPluginRunId() {
    return `run-${this.nextRun++}`
  }

  mintApprovalRequestId() {
    return `approval-${this.nextApproval++}`
  }

  add(plugin) {
    this.plugins.set(plugin.pluginId, plugin)
  }

  get(id) {
    return this.plugins.get(id)
  }

  delete(id) {
    return this.plugins.delete(id)
  }

  all() {
    return [...this.plugins.values()]
  }

  ofSession(sessionId) {
    return this.all().filter(plugin => plugin.sessionId === sessionId)
  }

  armRequest(id, pending) {
    this.pendingRequests.set(id, pending)
  }

  peekRequest(id) {
    return this.pendingRequests.get(id)
  }

  claimRequest(id) {
    const pending = this.pendingRequests.get(id)
    if (pending !== undefined) this.pendingRequests.delete(id)
    return pending
  }

  disarmRequest(id) {
    this.pendingRequests.delete(id)
  }

  pendingRequestFor(pluginId) {
    for (const [requestId, request] of this.pendingRequests) {
      if (request.pluginId === pluginId) return requestId
    }
    return undefined
  }
}
