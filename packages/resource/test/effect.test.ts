import { describe, expect, test } from "bun:test";

import { composeFeatures, defineFeature, defineResource, provide } from "../src";
import { makeEffectResourceRuntime } from "../src/effect.ts";

interface ConfigService {
  readonly prefix: string;
}

interface GreetingService {
  greet(name: string): Promise<string>;
}

const Config = defineResource<ConfigService>()("test/Config");
const Greeting = defineResource<GreetingService>()("test/Greeting");

describe("Effect Resource runtime", () => {
  test("builds in dependency order and releases in reverse order", async () => {
    const events: string[] = [];
    const config = provide({
      resource: Config,
      needs: {},
      make() {
        events.push("start config");
        return { prefix: "Hello" };
      },
      release() {
        events.push("stop config");
      },
    });
    const greeting = provide({
      resource: Greeting,
      needs: { config: Config },
      make({ config }) {
        events.push("start greeting");
        const { prefix } = config;
        return { greet: async (name) => `${prefix}, ${name}` };
      },
      release() {
        events.push("stop greeting");
      },
    });
    const manifest = composeFeatures([
      defineFeature({
        id: "example",
        needs: {},
        providers: [greeting, config] as const,
        tables: {},
      }),
    ] as const);
    const runtime = makeEffectResourceRuntime(manifest);

    const greetingService = await runtime.get(Greeting);
    expect(await greetingService.greet("Ada")).toBe("Hello, Ada");
    await runtime.close();

    expect(events).toEqual(["start config", "start greeting", "stop greeting", "stop config"]);
  });

  test("releases acquired dependencies after acquisition fails", async () => {
    const events: string[] = [];
    const config = provide({
      resource: Config,
      needs: {},
      make: () => {
        events.push("start config");
        return { prefix: "Hello" };
      },
      release: () => {
        events.push("stop config");
      },
    });
    const greeting = provide({
      resource: Greeting,
      needs: { config: Config },
      make: async () => {
        events.push("start greeting");
        throw new Error("no greeting");
      },
    });
    const manifest = composeFeatures([
      defineFeature({
        id: "failure",
        needs: {},
        providers: [greeting, config] as const,
        tables: {},
      }),
    ] as const);
    const runtime = makeEffectResourceRuntime(manifest);

    await expect(runtime.ready()).rejects.toThrow("Failed to acquire Resource 'test/Greeting'");
    expect(events).toEqual(["start config", "start greeting", "stop config"]);
    await runtime.close();
  });

  test("does not resolve a different Resource token that reuses an id", async () => {
    const ConfigAlias = defineResource<ConfigService>()("test/Config");
    const config = provide({
      resource: Config,
      needs: {},
      make: () => ({ prefix: "Hello" }),
    });
    const manifest = composeFeatures([
      defineFeature({
        id: "identity",
        needs: {},
        providers: [config] as const,
        tables: {},
      }),
    ] as const);
    const runtime = makeEffectResourceRuntime(manifest);

    await runtime.ready();
    await expect(runtime.get(ConfigAlias)).rejects.toThrow();
    await runtime.close();
  });
});
