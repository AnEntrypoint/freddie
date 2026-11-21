export const PATH_TOKEN = '{path}'

const macApp = (...fsNames) => ({ locators: [{ kind: 'app', fsNames }] })

const spec = (...locators) => ({ locators })

const desktopSpec = (desktopId, ...locators) => ({ locators, desktopId })

const cli = (name, ...args) => ({ kind: 'cli', name, args })

const desktopCli = (name, ...args) => ({ kind: 'cli', name, args, requiresDesktop: true })

const file = (candidates, ...args) => ({ kind: 'file', candidates, args })

const jetBrains = (id, cliName, macNames) => ({
  id,
  platforms: {
    darwin: macApp(...macNames),
    linux: spec(cli(cliName), file([`~/.local/share/JetBrains/Toolbox/scripts/${cliName}`])),
  },
})

export const OPEN_IN_APP_CATALOG = [
  {
    id: 'finder',
    platforms: {
      darwin: spec({
        kind: 'fixed',
        launch: { kind: 'shell-open' },
        iconPath: '/System/Library/CoreServices/Finder.app',
      }),
    },
  },
  { id: 'filemanager', platforms: { linux: spec(desktopCli('xdg-open')) } },
  {
    id: 'cursor',
    platforms: {
      darwin: macApp('Cursor.app'),
      linux: spec(cli('cursor')),
    },
  },
  {
    id: 'vscode',
    platforms: {
      darwin: macApp('Visual Studio Code.app'),
      linux: desktopSpec('code', cli('code')),
    },
  },
  {
    id: 'vscodeinsiders',
    platforms: {
      darwin: macApp('Visual Studio Code - Insiders.app'),
      linux: desktopSpec('code-insiders', cli('code-insiders')),
    },
  },
  {
    id: 'windsurf',
    platforms: {
      darwin: macApp('Windsurf.app'),
      linux: spec(cli('windsurf')),
    },
  },
  {
    id: 'zed',
    platforms: {
      darwin: macApp('Zed.app', 'Zed Preview.app'),
      linux: desktopSpec(
        'dev.zed.Zed',
        cli('zed'),
        { kind: 'desktop', desktopId: 'dev.zed.Zed', args: [] },
      ),
    },
  },
  {
    id: 'sublimetext',
    platforms: {
      darwin: macApp('Sublime Text.app'),
      linux: desktopSpec('sublime_text', cli('subl')),
    },
  },
  { id: 'xcode', platforms: { darwin: spec({ kind: 'xcode' }) } },
  {
    id: 'androidstudio',
    platforms: {
      darwin: macApp('Android Studio.app'),
      linux: spec(cli('studio'), file([
        '~/.local/share/JetBrains/Toolbox/scripts/studio',
        '/opt/android-studio/bin/studio.sh',
      ])),
    },
  },
  jetBrains('intellij', 'idea', ['IntelliJ IDEA.app', 'IntelliJ IDEA Ultimate.app', 'IntelliJ IDEA CE.app']),
  jetBrains('pycharm', 'pycharm', ['PyCharm.app', 'PyCharm Professional.app', 'PyCharm CE.app', 'PyCharm Community.app']),
  jetBrains('webstorm', 'webstorm', ['WebStorm.app']),
  jetBrains('phpstorm', 'phpstorm', ['PhpStorm.app']),
  jetBrains('goland', 'goland', ['GoLand.app']),
  jetBrains('rider', 'rider', ['Rider.app', 'JetBrains Rider.app']),
  jetBrains('rustrover', 'rustrover', ['RustRover.app']),
  {
    id: 'fork',
    platforms: {
      darwin: macApp('Fork.app'),
    },
  },
  { id: 'sourcetree', platforms: { darwin: macApp('Sourcetree.app') } },
  {
    id: 'github',
    platforms: {
      darwin: macApp('GitHub Desktop.app'),
    },
  },
  { id: 'tower', platforms: { darwin: macApp('Tower.app') } },
  { id: 'gitkraken', platforms: { darwin: macApp('GitKraken.app') } },
  { id: 'smartgit', platforms: { darwin: macApp('SmartGit.app') } },
  {
    id: 'sublimemerge',
    platforms: {
      darwin: macApp('Sublime Merge.app'),
      linux: desktopSpec('sublime_merge', cli('smerge')),
    },
  },
  {
    id: 'ghostty',
    platforms: {
      darwin: macApp('Ghostty.app'),
      linux: desktopSpec(
        'com.mitchellh.ghostty',
        cli('ghostty', `--working-directory=${PATH_TOKEN}`),
        { kind: 'desktop', desktopId: 'com.mitchellh.ghostty', args: [`--working-directory=${PATH_TOKEN}`] },
      ),
    },
  },
  { id: 'warp', platforms: { darwin: macApp('Warp.app') } },
  { id: 'iterm', platforms: { darwin: macApp('iTerm.app') } },
  {
    id: 'kitty',
    platforms: {
      darwin: macApp('kitty.app'),
      linux: desktopSpec(
        'kitty',
        cli('kitty', '--directory'),
        { kind: 'desktop', desktopId: 'kitty', args: ['--directory'] },
      ),
    },
  },
  {
    id: 'terminal',
    platforms: {
      darwin: spec({
        kind: 'fixed',
        launch: { kind: 'argv', command: 'open', args: ['-a', 'Terminal'] },
        iconPath: '/System/Applications/Utilities/Terminal.app',
      }),
    },
  },
  {
    id: 'gnometerminal',
    platforms: {
      linux: desktopSpec(
        'org.gnome.Terminal',
        cli('gnome-terminal', `--working-directory=${PATH_TOKEN}`),
        { kind: 'desktop', desktopId: 'org.gnome.Terminal', args: [`--working-directory=${PATH_TOKEN}`] },
      ),
    },
  },
  {
    id: 'konsole',
    platforms: {
      linux: desktopSpec(
        'org.kde.konsole',
        cli('konsole', '--workdir'),
        { kind: 'desktop', desktopId: 'org.kde.konsole', args: ['--workdir'] },
      ),
    },
  },
]
