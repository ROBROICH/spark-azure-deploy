import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { text } from "node:stream/consumers";
import { runProcess } from "@spark-workflow/test-support";

const backend = `${import.meta.dir}/../../../02-backend/apps`;
const fixture = `${import.meta.dir}/fixtures/process-output-entry.ts`;
const burst = `${import.meta.dir}/fixtures/burst-entry.ts`;
const watched =
  '("$0" "$@" & p=$!; (trap \'kill "$s" 2>/dev/null; wait "$s" 2>/dev/null; exit 0\' TERM; sleep 20 & s=$!; wait "$s"; kill -9 "$p") >/dev/null 2>&1 & w=$!; wait "$p"; r=$?; kill "$w" 2>/dev/null; wait "$w" 2>/dev/null; echo "exit=$r" >&2)';

function parse(text: string) {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const unparsed = lines.filter((line) => {
    try {
      return !(JSON.parse(line) instanceof Object);
    } catch {
      return true;
    }
  });
  expect(unparsed).toEqual([]);
  return lines.map((line) => JSON.parse(line));
}

async function events(args: readonly string[], env: Record<string, string>) {
  const { exitCode, stdout, stderr } = await runProcess(args, { env, timeout: 30_000 });
  return { exitCode, events: parse(`${stdout}${stderr}`) };
}

async function throughShell(reader: string, args: readonly string[], env: Record<string, string>) {
  const subprocess = Bun.spawn(["sh", "-c", `${watched} | ${reader}`, process.execPath, ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);
  return { stderr, events: parse(stdout) };
}

describe.each([
  {
    format: "ecs",
    level: "log.level",
    everyLine: { "ecs.version": "8.11.0" },
    handled: {
      "url.path": "/handled",
      "http.response.status_code": 409,
      error: expect.objectContaining({
        type: "EvlogError",
        message: "Handled failure",
        stack_trace: expect.any(String),
      }),
    },
    library: expect.objectContaining({
      type: "Error",
      message: "first line\nsecond line",
      cause: expect.objectContaining({ message: "Root cause" }),
    }),
    fatal: expect.objectContaining({ type: "Error", message: "Timer failure" }),
  },
  {
    format: "",
    level: "level",
    everyLine: { timestamp: expect.any(String), level: expect.any(String) },
    handled: {
      path: "/handled",
      status: 409,
      error: expect.objectContaining({
        name: "EvlogError",
        message: "Handled failure",
        stack: expect.any(String),
      }),
    },
    library: expect.objectContaining({
      name: "Error",
      message: "first line\nsecond line",
      cause: expect.objectContaining({ message: "Root cause" }),
    }),
    fatal: expect.objectContaining({ name: "Error", message: "Timer failure" }),
  },
])("LOG_FORMAT=$format", ({ format, level, everyLine, handled, library, fatal }) => {
  const fatalLine = {
    [level]: "error",
    message: "Process terminated by an unhandled error",
  };

  describe("S03 redaction", () => {
    test("fatal validation metadata cannot expand replacement tokens into rejected input", async () => {
      const output = await events(
        [`${import.meta.dir}/fixtures/redaction-entry.ts`, "replacement-token"],
        { LOG_FORMAT: format, NODE_ENV: "development" },
      );
      expect(output.exitCode).toBe(1);
      const serialized = JSON.stringify(output.events);
      expect(serialized).not.toContain("private-replacement-token-s03");
      expect(output.events).toContainEqual(expect.objectContaining({
        error: expect.objectContaining({ code: "VALIDATION" }),
      }));
    }, 30_000);

    test("serialization failure never restores an original sensitive message", async () => {
      const output = await events(
        [`${import.meta.dir}/fixtures/redaction-entry.ts`, "serialization"],
        { LOG_FORMAT: format, NODE_ENV: "development" },
      );
      expect(output.exitCode).toBe(0);
      expect(JSON.stringify(output.events)).not.toContain("personal-s03");
      expect(JSON.stringify(output.events)).not.toContain("9371234501234");
      expect(output.events).toContainEqual(expect.objectContaining({
        error: expect.objectContaining({ [format === "ecs" ? "type" : "name"]: "SerializationError" }),
      }));
    }, 30_000);

    for (const nodeEnv of ["development", "production"]) {
      for (const scenario of ["validation", "fields"]) {
        for (const mode of ["normal", "fatal"]) {
          test(`protects ${scenario} ${mode} output with NODE_ENV=${nodeEnv}`, async () => {
            const output = await events(
              [`${import.meta.dir}/fixtures/redaction-entry.ts`, scenario, mode],
              { LOG_FORMAT: format, NODE_ENV: nodeEnv },
            );
            expect(output.exitCode).toBe(mode === "fatal" ? 1 : 0);
            const serialized = JSON.stringify(output.events);
            const secrets = scenario === "validation"
              ? ["personal-s03", "private-age-s03", "9371234501234"]
              : ["password-s03", "secret-s03", "token-s03", "authorization-s03", "cookie-s03", "params-s03"];
            for (const value of secrets) {
              expect(serialized).not.toContain(value);
            }
            if (scenario === "validation") expect(serialized).toContain("VALIDATION");
            if (scenario === "validation" && mode === "normal") {
              expect(output.events).toContainEqual(expect.objectContaining({ responseStatus: 422 }));
            }
            if (scenario === "fields") {
              expect(serialized).toContain('"properties":{"email":{"type":"string"}}');
            }
          }, 30_000);
        }
      }
    }

    for (const mode of ["normal", "fatal"]) {
      test.skipIf(!process.env.S03_DATABASE_URL)(
        `protects real Drizzle parameters and PostgreSQL detail in ${mode} output`,
        async () => {
          const output = await events(
            [`${import.meta.dir}/fixtures/redaction-entry.ts`, "database", mode],
            { LOG_FORMAT: format, S03_DATABASE_URL: process.env.S03_DATABASE_URL! },
          );
          expect(output.exitCode).toBe(mode === "fatal" ? 1 : 0);
          const serialized = JSON.stringify(output.events);
          expect(serialized).not.toContain("database-personal-s03");
          expect(serialized).toContain("23505");
        },
        30_000,
      );
    }

    test("parsed configurations hide secret values in String and JSON serialization", async () => {
      const output = await events([`${import.meta.dir}/fixtures/config-redaction-entry.ts`], {
        LOG_FORMAT: format,
      });
      expect(output.exitCode).toBe(0);
      const serialized = JSON.stringify(output.events);
      expect(serialized).not.toContain("secret-s03");
      expect(serialized).toContain("<redacted>");
      expect(serialized).toContain("spicedb.invalid:50051");
    }, 30_000);
  });

  test("an invalid environment fails startup with one JSON event per line", async () => {
    const output = await events([`${backend}/spark-backend/src/index.ts`], {
      LOG_FORMAT: format,
      HOST: "",
    });

    expect(output.exitCode).toBe(1);
    for (const event of output.events) expect(event).toMatchObject(everyLine);
    expect(output.events).toContainEqual(
      expect.objectContaining({
        ...fatalLine,
        error: expect.objectContaining({ message: expect.any(String) }),
      }),
    );
  }, 30_000);

  test.each(["development", "production"])(
    "handled, library, console, warning, unserializable and fatal output is one JSON event per line with NODE_ENV=%s",
    async (nodeEnv) => {
      const output = await events([fixture], { LOG_FORMAT: format, NODE_ENV: nodeEnv });

      expect(output.exitCode).toBe(1);
      for (const event of output.events) expect(event).toMatchObject(everyLine);
      for (const expected of [
        handled,
        { message: expect.stringContaining("Library failure"), error: library },
        { message: expect.stringContaining("'table'") },
        { message: expect.stringContaining("nested: 'dir'") },
        { [level]: "error", message: "Assertion failed: Fixture assertion" },
        { message: "fixture-count: 1" },
        { message: "Fixture group" },
        { [level]: "debug", message: "Trace: Fixture trace formatted" },
        { message: "Fixture write" },
        { [level]: "warn", message: "Nested warning" },
        { [level]: "info", message: "Outer message" },
        {
          error: expect.objectContaining({ [format === "ecs" ? "type" : "name"]: "SerializationError" }),
        },
        { [level]: "warn", message: "Fixture warning" },
        { value: { count: "10", self: "[Circular]" } },
        { ...fatalLine, error: fatal },
      ]) {
        expect(output.events).toContainEqual(expect.objectContaining(expected));
      }
    },
    30_000,
  );

  test("a process with evlog disabled still writes its fatal line", async () => {
    const output = await events(["--preload", "@spark-workflow/test-support/evlog-disabled", fixture], {
      LOG_FORMAT: format,
    });

    expect(output.exitCode).toBe(1);
    expect(output.events).toEqual([
      expect.objectContaining({ ...everyLine, ...fatalLine, error: fatal }),
    ]);
  }, 30_000);

  test("a burst larger than the pipe buffer arrives as whole lines", async () => {
    const output = await events([burst, "200"], { LOG_FORMAT: format });

    expect(output.exitCode).toBe(0);
    expect(output.events.flatMap((event) => event.index ?? [])).toEqual(
      Array.from({ length: 200 }, (_, index) => index),
    );
  }, 30_000);

  test("a crash while the reader is stalled keeps every line and the fatal line", async () => {
    const output = await throughShell("(sleep 2; cat)", [burst, "200", "crash"], {
      LOG_FORMAT: format,
    });

    expect(output.stderr).toBe("exit=1\n");
    expect(output.events.flatMap((event) => event.index ?? [])).toEqual(
      Array.from({ length: 200 }, (_, index) => index),
    );
    expect(output.events.at(-1)).toMatchObject({
      ...fatalLine,
      error: expect.objectContaining({ message: "Fatal after burst" }),
    });
  }, 30_000);

  test("a fatal error while the reader is stalled stops serving and still writes the fatal line", async () => {
    const release = join(tmpdir(), `process-output-release-${crypto.randomUUID()}`);
    const subprocess = Bun.spawn(
      [
        "sh",
        "-c",
        `${watched} | (while [ ! -e "$RELEASE" ]; do sleep 0.05; done; cat)`,
        process.execPath,
        `${import.meta.dir}/fixtures/fatal-while-blocked-entry.ts`,
      ],
      { env: { ...process.env, LOG_FORMAT: format, RELEASE: release }, stdout: "pipe", stderr: "pipe" },
    );
    const stdout = new Response(subprocess.stdout).text();
    const stderrReader = subprocess.stderr.getReader();
    const decoder = new TextDecoder();
    let stderr = "";
    const until = async (marker: string) => {
      while (!stderr.includes(marker)) {
        const { done, value } = await stderrReader.read();
        if (done) throw new Error(`stderr ended before ${JSON.stringify(marker)}: ${stderr}`);
        stderr += decoder.decode(value, { stream: true });
      }
    };
    const status = (url: URL) => fetch(url).then((response) => response.status, () => "refused");
    try {
      await until("\n");
      const origin = new URL(stderr.split("\n")[0]!);
      expect(await status(new URL("/fail", origin))).toBe(200);
      await until("fatal\n");

      const health = await status(new URL("/healthz", origin));
      const business = await status(new URL("/business", origin));
      await Bun.write(release, "");
      await until("exit=");

      expect(health).toBe(503);
      expect(business).toBe(503);
      expect(stderr).not.toContain("business\n");
      expect(stderr).toContain("exit=1\n");
      const events = parse(await stdout);
      expect(events.flatMap((event) => event.index ?? [])).toEqual(
        Array.from({ length: 128 }, (_, index) => index),
      );
      expect(events).toContainEqual(expect.objectContaining({
        ...fatalLine,
        error: expect.objectContaining({ message: "Fatal while output is blocked" }),
      }));
    } finally {
      await Bun.write(release, "");
      await subprocess.exited;
      await rm(release, { force: true });
    }
  }, 30_000);

  test("blocked stdout leaves health requests and JS signal handlers responsive", async () => {
    const child = spawn(process.execPath, [`${import.meta.dir}/fixtures/blocked-output-entry.ts`], {
      env: { ...process.env, LOG_FORMAT: format },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    const exited = once(child, "exit");
    try {
      const [url] = await once(child, "message", { signal: AbortSignal.timeout(10_000) });
      const writing = once(child, "message", { signal: AbortSignal.timeout(2_000) });
      child.send("burst");
      await writing;
      const health = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      expect(await health.text()).toBe("healthy");

      const stopped = once(child, "message", { signal: AbortSignal.timeout(2_000) });
      child.kill("SIGTERM");
      const [signalMessage] = await stopped;
      expect(signalMessage).toBe("stopped");

      const [stdout, stderr, [exitCode]] = await Promise.all([
        text(child.stdout!),
        text(child.stderr!),
        exited,
      ]);
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).not.toContain("blocked-output-secret");
      const output = parse(stdout);
      expect(output).toEqual([
        expect.objectContaining({ ...everyLine, message: "Blocked output", payload: "x".repeat(4_000_000) }),
        expect.objectContaining({ ...everyLine, message: "Stopped after signal" }),
      ]);
    } finally {
      child.kill("SIGKILL");
      await exited;
    }
  }, 30_000);

  test("a closed stdout exits unsuccessfully instead of silently losing output", async () => {
    const output = await throughShell("true", [`${import.meta.dir}/fixtures/closed-stdout-entry.ts`], {
      LOG_FORMAT: format,
    });

    expect(output.stderr).toBe("exit=1\n");
  }, 30_000);
});
