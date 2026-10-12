import { expect, test } from "bun:test";

import { encryptFernet } from "../src/archival/fernet.ts";

test("matches the language-neutral Fernet specification vector", () => {
  const token = encryptFernet(
    new TextEncoder().encode("hello"),
    "cw_0x689RpI-jtRR7oE8h_eQsKImvJapLeSbXpwF4e4=",
    {
      timestampSeconds: 499_162_800,
      iv: Uint8Array.from([
        0, 1, 2, 3, 4, 5, 6, 7,
        8, 9, 10, 11, 12, 13, 14, 15,
      ]),
    },
  );

  expect(new TextDecoder().decode(token)).toBe(
    "gAAAAAAdwJ6wAAECAwQFBgcICQoLDA0ODy021cpGVWKZ_eEwCGM4BLLF_5CV9dOPmrhuVUPgJobwOz7JcbmrR64jVmpU4IwqDA==",
  );
});
