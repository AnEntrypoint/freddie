
import { transportError } from '@freddie/freddie-host-apiproxy/api'
import { Notifier } from '../sessions/notifier.js'

export class Workspace {
  view
  intent
  materialization = null
  snapshotCache
  notifier = new Notifier(() => {
    this.snapshotCache = this.buildSnapshot()
  })

  constructor(api, source) {
    this.api = api
    if ('workspaceId' in source) {
      this.view = source
    } else {
      this.intent = {
        input: source,
        snapshot: { name: intentName(source), phase: 'ready' },
      }
    }
    this.snapshotCache = this.buildSnapshot()
  }

  materialize() {
    if (this.materialization !== null) return this.materialization
    const intent = this.intent
    if (intent === undefined) return undefined
    intent.snapshot = { name: intent.snapshot.name, phase: 'creating' }
    this.notifier.notifyNow()
    const completion = this.completeMaterialization(intent).finally(() => {
      if (this.materialization === completion) this.materialization = null
    })
    this.materialization = completion
    return completion
  }

  adopt(view) {
    if (this.view !== undefined && this.view.workspaceId !== view.workspaceId) {
      throw new Error('cannot adopt a different Workspace id')
    }
    this.view = view
    this.intent = undefined
    this.notifier.markDirty()
  }

  subscribe(listener) {
    return this.notifier.subscribe(listener)
  }

  getSnapshot() {
    this.notifier.ensureFresh()
    return this.snapshotCache
  }

  async completeMaterialization(
    intent,
  ) {
    let result
    try {
      result = (await this.api.workspace.create(intent.input)).result
    } catch (error) {
      result = transportError(error)
    }
    if (this.intent !== intent) return result
    if (result.ok) {
      this.adopt(result.value.workspace)
    } else {
      intent.snapshot = {
        name: intent.snapshot.name,
        phase: 'ready',
        error: `${result.error.code}: ${result.error.message}`,
      }
      this.notifier.markDirty()
    }
    return result
  }

  buildSnapshot() {
    return { view: this.view, intent: this.intent?.snapshot }
  }
}

function intentName(input) {
  const trimmed = input.path.replace(/[\\/]+$/, '')
  return trimmed.split(/[\\/]/).pop() ?? input.path
}
