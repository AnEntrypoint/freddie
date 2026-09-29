export function sessionCwd(exec) {
  return exec.agent?.session.header.cwd
}
