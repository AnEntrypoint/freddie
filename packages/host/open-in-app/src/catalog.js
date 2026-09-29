/**
 * The open-in-app application catalog: a compile-time table of launchable
 * applications, each declaring per-platform launcher sources tried in order.
 * The table is data only — `resolver.js` resolves it against this host,
 * `icons.js` extracts icons from what resolution proved. An entry that declares
 * no locator for the running platform resolves as absent, so the catalog never
 * guesses from an install record alone.
 * @module @freddie/freddie-host-open-in-app/catalog
 */

/** Launch-arg token the workspace directory substitutes into (`--cd={path}`). */
export const PATH_TOKEN = '{path}'

/**
 * How a resolved application takes the workspace directory. `argv` spawns the
 * launcher detached, substituting the directory into the arg carrying
 * {@link PATH_TOKEN} or appending it when no arg does. `shell-open` hands the
 * directory to the operating system shell's open verb — the channel the file
 * managers use, because they are the OS default for a directory and a direct
 * `explorer.exe <dir>` spawn does not reliably raise a window.
 * @typedef {{
 *   readonly kind: 'argv',
 *   readonly command: string,
 *   readonly args: readonly string[],
 *   readonly env?: Readonly<Record<string, string>>,
 *   readonly windowsHide?: boolean,
 * } | {
 *   readonly kind: 'shell-open',
 * }} OpenInAppLaunch
 */

/**
 * How one platform derives a verified launcher. Every kind resolves to an
 * artifact this host actually holds — an existing `.app` bundle, an executable
 * on disk, or a PATH resolution — never a bare install record: `fixed` ships
 * with the OS; `app` checks the known `.app` directories for the named bundles;
 * `xcode` follows `xcode-select -p`, so Beta or renamed installs are found;
 * `cli` resolves a PATH name in-process (PATH/PATHEXT stat, no shell, no
 * `which`); `file` takes the first existing expanded candidate; `scan` picks the
 * newest matching versioned install directory; `app-paths` reads the Windows
 * `App Paths` registry keys; `install-record` reads the Windows Uninstall
 * records and verifies the executable they point at; `github-desktop` resolves
 * GitHub Desktop's versioned executable and packaged CLI together; `desktop`
 * reads a Linux XDG desktop entry and verifies its `TryExec`/`Exec` executable.
 * @typedef {{
 *   readonly kind: 'fixed',
 *   readonly launch: OpenInAppLaunch,
 *   readonly iconPath: string,
 * } | {
 *   readonly kind: 'app',
 *   readonly fsNames: readonly string[],
 * } | {
 *   readonly kind: 'xcode',
 * } | {
 *   readonly kind: 'cli',
 *   readonly name: string,
 *   readonly args: readonly string[],
 *   readonly requiresDesktop?: boolean,
 * } | {
 *   readonly kind: 'file',
 *   readonly candidates: readonly string[],
 *   readonly args: readonly string[],
 * } | {
 *   readonly kind: 'scan',
 *   readonly root: string,
 *   readonly namePrefix: string,
 *   readonly relativeLauncher: string,
 *   readonly args: readonly string[],
 * } | {
 *   readonly kind: 'app-paths',
 *   readonly exe: string,
 *   readonly args: readonly string[],
 * } | {
 *   readonly kind: 'install-record',
 *   readonly displayNamePrefix: string,
 *   readonly relativeLauncher?: string,
 *   readonly args: readonly string[],
 * } | {
 *   readonly kind: 'github-desktop',
 *   readonly root: string,
 * } | {
 *   readonly kind: 'desktop',
 *   readonly desktopId: string,
 *   readonly args: readonly string[],
 * }} OpenInAppLocator
 */

/**
 * One platform's launcher sources and, on Linux, the desktop entry owning its
 * icon (macOS icons come from the resolved bundle and Windows icons from the
 * resolved executable, neither of which needs a declaration).
 * @typedef {{
 *   readonly locators: readonly OpenInAppLocator[],
 *   readonly desktopId?: string,
 * }} OpenInAppPlatformSpec
 */

/**
 * One launchable application and the platforms that can offer it.
 * @typedef {{
 *   readonly id: string,
 *   readonly platforms: Readonly<Record<string, OpenInAppPlatformSpec | undefined>>,
 * }} OpenInAppApp
 */

/** macOS spec checking the known application directories for the named bundles. */
const macApp = (...fsNames) => ({ locators: [{ kind: 'app', fsNames }] })

/** Spec from its locator chain. */
const spec = (...locators) => ({ locators })

/** Spec from its locator chain plus the Linux desktop entry owning its icon. */
const desktopSpec = (desktopId, ...locators) => ({ locators, desktopId })

/** In-process PATH-name locator launching the resolved executable. */
const cli = (name, ...args) => ({ kind: 'cli', name, args })

/** In-process PATH-name locator offered only when the host announces a desktop. */
const desktopCli = (name, ...args) => ({ kind: 'cli', name, args, requiresDesktop: true })

/** First-existing-candidate locator launching the matched candidate. */
const file = (candidates, ...args) => ({ kind: 'file', candidates, args })

/** Windows `App Paths` registry locator for one registered executable name. */
const appPaths = (exe, ...args) => ({ kind: 'app-paths', exe, args })

/** Windows Uninstall-record locator verified through the executable it proves. */
const installRecord = (displayNamePrefix, relativeLauncher, ...args) =>
  ({ kind: 'install-record', displayNamePrefix, relativeLauncher, args })

/**
 * JetBrains product entry: known bundle names on macOS (direct-download and
 * Toolbox spellings), the newest versioned `%ProgramFiles%\JetBrains` install or
 * a verified Uninstall record on Windows, PATH command or Toolbox shell script
 * on Linux.
 */
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

/**
 * The launch catalog in menu order: file managers, editors and IDEs, Git GUIs,
 * terminals. Finder, Terminal, and File Explorer ship with their operating
 * system, so their locators always resolve there. macOS bundle names list the
 * common install spellings; a bundle renamed beyond them or moved outside
 * `/Applications` and `~/Applications` is not detected (README Known
 * Limitations), because there is no Launch Services lookup and deliberately no
 * disk scan.
 */
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
