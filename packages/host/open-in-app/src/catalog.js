export const PATH_TOKEN = '{path}'





const macApp = (...fsNames) => ({ locators: [{ kind: 'app', fsNames }] })

const spec = (...locators) => ({ locators })

const desktopSpec = (desktopId, ...locators) => ({ locators, desktopId })

const cli = (name, ...args) => ({ kind: 'cli', name, args })

const desktopCli = (name, ...args) => ({ kind: 'cli', name, args, requiresDesktop: true })

const file = (candidates, ...args) => ({ kind: 'file', candidates, args })

const appPaths = (exe, ...args) => ({ kind: 'app-paths', exe, args })

const installRecord = (displayNamePrefix, relativeLauncher, ...args) =>
  ({ kind: 'install-record', displayNamePrefix, relativeLauncher, args })

const jetBrains = (id, productName, cliName, winExe, macNames) => ({
  id,
  platforms: {
    darwin: macApp(...macNames),
    win32: spec(
      {
        kind: 'scan',
        root: '${ProgramFiles}/JetBrains',
        namePrefix: productName,
        relativeLauncher: `bin/${winExe}`,
        args: [],
      },
      installRecord(productName, `bin/${winExe}`),
    ),
    linux: spec(cli(cliName), file([`~/.local/share/JetBrains/Toolbox/scripts/${cliName}`])),
  },
})

const GIT_FOR_WINDOWS_DISPLAY_NAME_PREFIX = 'Git version'

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
  {
    id: 'explorer',
    platforms: {
      win32: spec({
        kind: 'fixed',
        launch: { kind: 'shell-open' },
        iconPath: '${SystemRoot}/explorer.exe',
      }),
    },
  },
  { id: 'filemanager', platforms: { linux: spec(desktopCli('xdg-open')) } },
  {
    id: 'cursor',
    platforms: {
      darwin: macApp('Cursor.app'),
      win32: spec(
        appPaths('Cursor.exe'),
        installRecord('Cursor'),
        file(['${LOCALAPPDATA}/Programs/cursor/Cursor.exe']),
      ),
      linux: spec(cli('cursor')),
    },
  },
  {
    id: 'vscode',
    platforms: {
      darwin: macApp('Visual Studio Code.app'),
      win32: spec(
        appPaths('Code.exe'),
        installRecord('Microsoft Visual Studio Code', 'Code.exe'),
        file([
          '${LOCALAPPDATA}/Programs/Microsoft VS Code/Code.exe',
          '${ProgramFiles}/Microsoft VS Code/Code.exe',
        ]),
      ),
      linux: desktopSpec('code', cli('code')),
    },
  },
  {
    id: 'vscodeinsiders',
    platforms: {
      darwin: macApp('Visual Studio Code - Insiders.app'),
      win32: spec(
        appPaths('Code - Insiders.exe'),
        installRecord('Microsoft Visual Studio Code Insiders', 'Code - Insiders.exe'),
        file(['${LOCALAPPDATA}/Programs/Microsoft VS Code Insiders/Code - Insiders.exe']),
      ),
      linux: desktopSpec('code-insiders', cli('code-insiders')),
    },
  },
  {
    id: 'windsurf',
    platforms: {
      darwin: macApp('Windsurf.app'),
      win32: spec(
        appPaths('Windsurf.exe'),
        installRecord('Windsurf'),
        file(['${LOCALAPPDATA}/Programs/Windsurf/Windsurf.exe']),
      ),
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
      win32: spec(
        appPaths('sublime_text.exe'),
        installRecord('Sublime Text'),
        file(['${ProgramFiles}/Sublime Text/sublime_text.exe']),
      ),
      linux: desktopSpec('sublime_text', cli('subl')),
    },
  },
  { id: 'xcode', platforms: { darwin: spec({ kind: 'xcode' }) } },
  {
    id: 'androidstudio',
    platforms: {
      darwin: macApp('Android Studio.app'),
      win32: spec(
        installRecord('Android Studio', 'bin/studio64.exe'),
        file(['${ProgramFiles}/Android/Android Studio/bin/studio64.exe']),
      ),
      linux: spec(cli('studio'), file([
        '~/.local/share/JetBrains/Toolbox/scripts/studio',
        '/opt/android-studio/bin/studio.sh',
      ])),
    },
  },
  jetBrains('intellij', 'IntelliJ IDEA', 'idea', 'idea64.exe',
    ['IntelliJ IDEA.app', 'IntelliJ IDEA Ultimate.app', 'IntelliJ IDEA CE.app']),
  jetBrains('pycharm', 'PyCharm', 'pycharm', 'pycharm64.exe',
    ['PyCharm.app', 'PyCharm Professional.app', 'PyCharm CE.app', 'PyCharm Community.app']),
  jetBrains('webstorm', 'WebStorm', 'webstorm', 'webstorm64.exe', ['WebStorm.app']),
  jetBrains('phpstorm', 'PhpStorm', 'phpstorm', 'phpstorm64.exe', ['PhpStorm.app']),
  jetBrains('goland', 'GoLand', 'goland', 'goland64.exe', ['GoLand.app']),
  jetBrains('rider', 'Rider', 'rider', 'rider64.exe', ['Rider.app', 'JetBrains Rider.app']),
  jetBrains('rustrover', 'RustRover', 'rustrover', 'rustrover64.exe', ['RustRover.app']),
  {
    id: 'fork',
    platforms: {
      darwin: macApp('Fork.app'),
      win32: spec(installRecord('Fork'), file(['${LOCALAPPDATA}/Fork/Fork.exe'])),
    },
  },
  { id: 'sourcetree', platforms: { darwin: macApp('Sourcetree.app') } },
  {
    id: 'github',
    platforms: {
      darwin: macApp('GitHub Desktop.app'),
      win32: spec({ kind: 'github-desktop', root: '${LOCALAPPDATA}/GitHubDesktop' }),
    },
  },
  { id: 'tower', platforms: { darwin: macApp('Tower.app') } },
  { id: 'gitkraken', platforms: { darwin: macApp('GitKraken.app') } },
  { id: 'smartgit', platforms: { darwin: macApp('SmartGit.app') } },
  {
    id: 'sublimemerge',
    platforms: {
      darwin: macApp('Sublime Merge.app'),
      win32: spec(
        appPaths('sublime_merge.exe'),
        installRecord('Sublime Merge'),
        file(['${ProgramFiles}/Sublime Merge/sublime_merge.exe']),
      ),
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
  { id: 'windowsterminal', platforms: { win32: spec(cli('wt', '-d')) } },
  {
    id: 'gitbash',
    platforms: {
      win32: spec(
        installRecord(GIT_FOR_WINDOWS_DISPLAY_NAME_PREFIX, 'git-bash.exe', `--cd=${PATH_TOKEN}`),
        file(['${ProgramFiles}/Git/git-bash.exe'], `--cd=${PATH_TOKEN}`),
      ),
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
