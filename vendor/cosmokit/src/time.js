/** Time constants plus parsing and formatting helpers. */
const millisecond = 1
const second = 1000
const minute = second * 60
const hour = minute * 60
const day = hour * 24
const week = day * 7

let timezoneOffset = new Date().getTimezoneOffset()

function setTimezoneOffset(offset) {
  timezoneOffset = offset
}

function getTimezoneOffset() {
  return timezoneOffset
}

function getDateNumber(date = new Date(), offset) {
  if (typeof date === 'number') date = new Date(date)
  if (offset === undefined) offset = timezoneOffset
  return Math.floor((date.valueOf() / minute - offset) / 1440)
}

function fromDateNumber(value, offset) {
  const date = new Date(value * day)
  if (offset === undefined) offset = timezoneOffset
  return new Date(+date + offset * minute)
}

const numeric = /\d+(?:\.\d+)?/.source
const timeRegExp = new RegExp(`^${[
  'w(?:eek(?:s)?)?',
  'd(?:ay(?:s)?)?',
  'h(?:our(?:s)?)?',
  'm(?:in(?:ute)?(?:s)?)?',
  's(?:ec(?:ond)?(?:s)?)?',
].map(unit => `(${numeric}${unit})?`).join('')}$`)

function parseTime(source) {
  const capture = timeRegExp.exec(source)
  if (!capture) return 0
  return (parseFloat(capture[1]) * week || 0)
    + (parseFloat(capture[2]) * day || 0)
    + (parseFloat(capture[3]) * hour || 0)
    + (parseFloat(capture[4]) * minute || 0)
    + (parseFloat(capture[5]) * second || 0)
}

function parseDate(date) {
  const parsed = parseTime(date)
  if (parsed) {
    date = Date.now() + parsed
  } else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) {
    date = `${new Date().toLocaleDateString()}-${date}`
  } else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) {
    date = `${new Date().getFullYear()}-${date}`
  }
  return date ? new Date(date) : new Date()
}

function format(ms) {
  const abs = Math.abs(ms)
  if (abs >= day - hour / 2) {
    return Math.round(ms / day) + 'd'
  } else if (abs >= hour - minute / 2) {
    return Math.round(ms / hour) + 'h'
  } else if (abs >= minute - second / 2) {
    return Math.round(ms / minute) + 'm'
  } else if (abs >= second) {
    return Math.round(ms / second) + 's'
  }
  return ms + 'ms'
}

function toDigits(source, length = 2) {
  return source.toString().padStart(length, '0')
}

function template(template, time = new Date()) {
  return template
    .replace('yyyy', time.getFullYear().toString())
    .replace('yy', time.getFullYear().toString().slice(2))
    .replace('MM', toDigits(time.getMonth() + 1))
    .replace('dd', toDigits(time.getDate()))
    .replace('hh', toDigits(time.getHours()))
    .replace('mm', toDigits(time.getMinutes()))
    .replace('ss', toDigits(time.getSeconds()))
    .replace('SSS', toDigits(time.getMilliseconds(), 3))
}

export const Time = {
  millisecond, second, minute, hour, day, week,
  setTimezoneOffset, getTimezoneOffset, getDateNumber, fromDateNumber,
  parseTime, parseDate, format, toDigits, template,
}
