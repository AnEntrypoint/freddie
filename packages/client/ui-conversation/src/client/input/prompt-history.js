export class PromptHistoryNavigator {
  #source
  #entries = null
  #loading = null
  #index = null
  #saved = ''
  #echo = null
  #pending = 0

  constructor(source) {
    this.#source = source
  }

  get navigating() {
    return this.#index !== null
  }

  get echo() {
    return this.#echo
  }

  reset() {
    this.#entries = null
    this.#index = null
    this.#saved = ''
    this.#echo = null
    this.#pending = 0
  }

  step(direction, draft, apply) {
    if (this.#index === null && direction === 'down') return false
    if (this.#entries === null) {
      if (this.#loading === null) this.#begin(draft, apply)
      this.#pending += direction === 'up' ? 1 : -1
      return true
    }
    this.#move(direction, apply)
    return true
  }

  #begin(draft, apply) {
    this.#saved = draft
    this.#loading = this.#source().then(
      (entries) => {
        this.#entries = entries
        this.#loading = null
        const steps = this.#pending
        this.#pending = 0
        for (let i = 0; i < Math.abs(steps); i += 1) {
          this.#move(steps > 0 ? 'up' : 'down', apply)
        }
      },
      () => {
        this.#loading = null
        this.reset()
      },
    )
  }

  #move(direction, apply) {
    const entries = this.#entries
    if (entries === null) return
    if (direction === 'up') {
      const next = this.#index === null ? entries.length - 1 : this.#index - 1
      if (next < 0) return
      this.#index = next
      this.#show(entries[next], 'start', apply)
      return
    }
    if (this.#index === null) return
    const next = this.#index + 1
    if (next >= entries.length) {
      const restored = this.#saved
      this.#index = null
      this.#entries = null
      this.#show(restored, 'end', apply)
      this.#echo = null
      return
    }
    this.#index = next
    this.#show(entries[next], 'end', apply)
  }

  #show(text, caret, apply) {
    this.#echo = text
    apply(text, caret)
  }
}
