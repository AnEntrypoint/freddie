export function pnpmInvocation(
  args,
  environment = process.env,
) {
  const entrypoint = environment.npm_execpath
  if (entrypoint === undefined || entrypoint === '') {
    throw new Error('pnpm invocation: npm_execpath is unavailable; invoke the script through pnpm run.')
  }
  if (/\.[cm]?js$/iu.test(entrypoint)) {
    return { command: process.execPath, args: [entrypoint, ...args] }
  }
  return { command: entrypoint, args: [...args] }
}
