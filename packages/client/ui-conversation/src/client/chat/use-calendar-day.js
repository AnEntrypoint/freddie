import { msUntilNextLocalMidnight, startOfLocalDay } from './message-chrome.js'

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
