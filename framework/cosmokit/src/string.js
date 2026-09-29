export function capitalize(source) {
  return source.charAt(0).toUpperCase() + source.slice(1)
}

export function uncapitalize(source) {
  return source.charAt(0).toLowerCase() + source.slice(1)
}

export function camelCase(source) {
  return source.replace(/[_-][a-z]/g, str => str.slice(1).toUpperCase())
}

const State = {
  DELIM: 0,
  UPPER: 1,
  LOWER: 2,
}

function tokenize(source, delimiters, delimiter) {
  const output = []
  let state = State.DELIM
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i)
    if (code >= 65 && code <= 90) {
      if (state === State.UPPER) {
        const next = source.charCodeAt(i + 1)
        if (next >= 97 && next <= 122) {
          output.push(delimiter)
        }
        output.push(code + 32)
      } else {
        if (state !== State.DELIM) {
          output.push(delimiter)
        }
        output.push(code + 32)
      }
      state = State.UPPER
    } else if (code >= 97 && code <= 122) {
      output.push(code)
      state = State.LOWER
    } else if (delimiters.includes(code)) {
      if (state !== State.DELIM) {
        output.push(delimiter)
      }
      state = State.DELIM
    } else {
      output.push(code)
    }
  }
  return String.fromCharCode(...output)
}

export function paramCase(source) {
  return tokenize(source, [45, 95], 45)
}

export function snakeCase(source) {
  return tokenize(source, [45, 95], 95)
}

export const camelize = camelCase
export const hyphenate = paramCase

export function formatProperty(key) {
  if (typeof key !== 'string') return `[${key.toString()}]`
  return /^[a-z_$][\w$]*$/i.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`
}

export function trimSlash(source) {
  return source.replace(/\/$/, '')
}

export function sanitize(source) {
  if (!source.startsWith('/')) source = '/' + source
  return trimSlash(source)
}
