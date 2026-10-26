import { msUntilNextLocalMidnight, startOfLocalDay } from './message-chrome.js'

const subscribers = new Set()
let day = startOfLocalDay(Date.now())
let timer = null

const arm = () => {
  const now = Date.now()
  day = startOfLocalDay(now)
  timer = setTimeout(arm, msUntilNextLocalMidnight(now))
  for (const subscriber of subscribers) subscriber(day)
}

export function createCalendarDay(onChange) {
  const subscriber = (next) => onChange(next)
  if (timer === null) {
    day = startOfLocalDay(Date.now())
    timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now()))
  }
  subscribers.add(subscriber)

  return {
    get day() { return day },
    stop() {
      subscribers.delete(subscriber)
      if (subscribers.size === 0 && timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}
