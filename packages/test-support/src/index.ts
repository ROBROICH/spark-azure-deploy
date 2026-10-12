export async function runProcess(
  args: readonly string[],
  { env, timeout }: { env?: Record<string, string>; timeout?: number } = {},
) {
  const subprocess = Bun.spawn([process.execPath, ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
    timeout,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}
