export class Win32Error extends Error {
  api
  win32Code

  constructor(api, win32Code, detail) {
    super(`${api} failed (Win32 ${win32Code})${detail === undefined ? '' : `: ${detail}`}`)
    this.name = 'Win32Error'
    this.api = api
    this.win32Code = win32Code
  }
}
