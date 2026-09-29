export const APP_IDS = [
  'finder', 'explorer', 'filemanager', 'cursor', 'vscode', 'vscodeinsiders', 'windsurf', 'zed',
  'sublimetext', 'xcode', 'androidstudio', 'intellij', 'pycharm', 'webstorm', 'phpstorm', 'goland',
  'rider', 'rustrover', 'fork', 'sourcetree', 'github', 'tower', 'gitkraken', 'smartgit',
  'sublimemerge', 'ghostty', 'warp', 'iterm', 'kitty', 'terminal', 'windowsterminal', 'gitbash',
  'gnometerminal', 'konsole',
]

export const appLabelKey = id => `app.${id}`

export const nameableApps = ids => (Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && APP_IDS.includes(id)) : [])
