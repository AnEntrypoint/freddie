export const APP_IDS = [
  'finder', 'explorer', 'filemanager', 'cursor', 'vscode', 'vscodeinsiders', 'windsurf', 'zed',
  'sublimetext', 'xcode', 'androidstudio', 'intellij', 'pycharm', 'webstorm', 'phpstorm', 'goland',
  'rider', 'rustrover', 'fork', 'sourcetree', 'github', 'tower', 'gitkraken', 'smartgit',
  'sublimemerge', 'ghostty', 'warp', 'iterm', 'kitty', 'terminal', 'windowsterminal', 'gitbash',
  'gnometerminal', 'konsole',
]

/**
 * @param {string} id catalog id served by the host.
 * @returns {string} the locale key naming the application.
 */
export const appLabelKey = id => `app.${id}`

/**
 * @param {unknown} ids raw `apps` member of the host answer.
 * @returns {string[]} the nameable catalog ids, in host menu order.
 */
export const nameableApps = ids => (Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && APP_IDS.includes(id)) : [])
