import { isNullable } from './misc.js'

export function contain(array1, array2) {
  return array2.every(item => array1.includes(item))
}

export function intersection(array1, array2) {
  return array1.filter(item => array2.includes(item))
}

export function difference(array1, array2) {
  return array1.filter(item => !array2.includes(item))
}

export function union(array1, array2) {
  return Array.from(new Set([...array1, ...array2]))
}

export function deduplicate(array) {
  return [...new Set(array)]
}

export function remove(list, item) {
  const index = list?.indexOf(item)
  if (index >= 0) {
    list.splice(index, 1)
    return true
  } else {
    return false
  }
}

export function makeArray(source) {
  return Array.isArray(source) ? source : isNullable(source) ? [] : [source]
}
