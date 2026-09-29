import { Service } from '@freddie/cordis'
import Schema from '@freddie/schemastery'

function cloneContainer(container, key) {
  if (Array.isArray(container)) return [...container]
  if (typeof container === 'object' && container !== null) return { ...container }
  return /^\d+$/.test(key) ? [] : {}
}

function cloneSpine(root, path) {
  const result = { ...root }
  let target = result
  for (let index = 0; index < path.length - 1; index++) {
    const key = path[index]
    const child = cloneContainer(
      Array.isArray(target) ? target[Number(key)] : target[key],
      path[index + 1],
    )
    if (Array.isArray(target)) target[Number(key)] = child
    else target[key] = child
    target = child
  }
  return { result, parent: target, leaf: path[path.length - 1] }
}

export class SettingsSchemaService extends Service {
  constructor(ctx) {
    super(ctx, 'settingsSchema')
  }

  rehydrate(serialized) {
    return new Schema(serialized)
  }

  validate(schema, draft) {
    try {
      schema(draft)
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }

  nodeAtPath(root, path) {
    let node = root
    for (const key of path) {
      if (node === undefined) return undefined
      if (node.type === 'object') node = node.dict?.[key]
      else if (node.type === 'dict' || node.type === 'array') node = node.inner
      else return undefined
    }
    return node
  }

  getPath(value, path) {
    let current = value
    for (const key of path) {
      if (Array.isArray(current)) {
        current = current[Number(key)]
        continue
      }
      if (typeof current !== 'object' || current === null) return undefined
      current = current[key]
    }
    return current
  }

  hasPath(value, path) {
    if (path.length === 0) return value !== undefined
    const parent = this.getPath(value, path.slice(0, -1))
    const key = path[path.length - 1]
    if (Array.isArray(parent)) return Number(key) < parent.length
    if (typeof parent !== 'object' || parent === null) return false
    return key in parent
  }

  setPath(root, path, value) {
    if (path.length === 0) throw new Error('ui-settings: setPath needs a non-empty path')
    const { result, parent, leaf } = cloneSpine(root, path)
    if (Array.isArray(parent)) parent[Number(leaf)] = value
    else parent[leaf] = value
    return result
  }

  deletePath(root, path) {
    if (path.length === 0) throw new Error('ui-settings: deletePath needs a non-empty path')
    if (!this.hasPath(root, path)) return root
    const { result, parent, leaf } = cloneSpine(root, path)
    if (Array.isArray(parent)) parent.splice(Number(leaf), 1)
    else Reflect.deleteProperty(parent, leaf)
    return result
  }
}
