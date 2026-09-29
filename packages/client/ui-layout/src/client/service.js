export class LayoutController {
  #panels

  attachPanels(actions) {
    this.#panels = actions
  }

  toggleSidebar() {
    this.#require().toggleSidebar()
  }

  openDetails() {
    this.#require().openDetails()
  }

  closeDetails() {
    this.#require().closeDetails()
  }

  #require() {
    if (this.#panels === undefined) throw new Error('layout: panel actions not wired (root entry not mounted)')
    return this.#panels
  }
}
