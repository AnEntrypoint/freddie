import { msUntilNextLocalMidnight, startOfLocalDay } from './message-chrome.js'

/**
 * Create a local calendar-day epoch that advances at each local midnight.
 * @param onChange - called with the new `day` value whenever it changes.
 * @returns a controller exposing `day` and `stop`.
 */
export function createCalendarDay(onChange) {
  let day = startOfLocalDay(Date.now())
  let timer = null

  const arm = () => {
    const now = Date.now()
    day = startOfLocalDay(now)
    onChange(day)
    timer = setTimeout(arm, msUntilNextLocalMidnight(now))
  }
  timer = setTimeout(arm, msUntilNextLocalMidnight(Date.now()))

  return {
    get day() { return day },
    stop() {
      if (timer === null) return
      clearTimeout(timer)
      timer = null
    },
  }
}
