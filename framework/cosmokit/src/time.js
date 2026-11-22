const second = 1000
const minute = second * 60
const hour = minute * 60
const day = hour * 24

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

const toDigits = (source, length = 2) => source.toString().padStart(length, '0')

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

export const Time = { format, template }
