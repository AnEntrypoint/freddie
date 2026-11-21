const tools = (service, members) => ({ service, namespace: 'tools', members, callable: false })
const namespace = (service, name, callable = false) => ({ service, namespace: name, members: null, callable })

export default Object.freeze({
  'tools.file': tools('hostFileTools', ['read_file', 'write_file', 'edit_file', 'glob_files', 'grep_files', 'ReadMediaFile']),
  'tools.shell': tools('hostShellTools', ['Bash', 'TaskOutput', 'TaskStop', 'TaskList', 'WaitFor']),
  'tools.web': tools('hostWebTools', ['FetchURL', 'WebSearch']),
  'tools.agent': tools('hostAgentTools', ['Agent', 'AgentSwarm', 'superagent']),
  'tools.session': tools('hostSessionTools', [
    'TodoList', 'Skill', 'install_skill', 'read_tool_result', 'AskUserQuestion', 'NotifyUser', 'ExitPlanMode', 'vision',
    'CronCreate', 'CronList', 'CronDelete', 'CreateGoal', 'GetGoal', 'SetGoalBudget', 'UpdateGoal',
    'TowerInit', 'TowerPlan', 'TowerSpawn', 'TowerMission', 'TowerStatus', 'TowerMerge', 'TowerRebase', 'TowerTeardown',
    'TowerInbox', 'TowerSend', 'TowerFinding', 'TowerReview', 'TowerComplete',
  ]),
  'tools.browser': tools('hostBrowserTools', ['Browser']),
  'tools.mcp': tools('hostMcpTools', ['capability_search', 'select_tools', 'ReadMcpResourceTool']),
  'agent.core': { service: 'hostAgent', namespace: 'agent', members: ['hooks'], callable: true },
  'agent.persistence': { service: 'hostAgentPersistence', namespace: 'agent', members: ['sessions', 'createMemoryPersistence'], callable: false },
  'net.fetch': namespace('hostFetch', 'fetch', true),
  'net.tls': { service: null },
  'net.server': namespace('hostServe', 'serve', true),
  'net.ws': { service: null },
  fs: namespace('hostFs', 'fs'),
  watch: namespace('hostWatch', 'watch', true),
  proc: namespace('hostProc', 'proc'),
  pty: namespace('hostPty', 'pty'),
  timers: namespace('hostTimers', 'timers'),
  dns: namespace('hostDns', 'dns'),
  crypto: namespace('hostCrypto', 'crypto'),
  sqlite: namespace('hostSqlite', 'sqlite'),
  loader: namespace('hostLoader', 'loader'),
  reload: namespace('hostReload', 'reload'),
})
