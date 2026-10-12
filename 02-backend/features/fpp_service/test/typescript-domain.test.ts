import { describe, expect, test } from "bun:test";

import {
  buildFppXml,
  buildMissingEntryDateXml,
  malformedFppXml,
  mutationScenarios,
  unsafeFppXml,
} from "./support/mutation-scenarios.ts";
import { parseFppXml } from "../src/xml.ts";
import { validateFileUrl } from "../src/url.ts";

describe("FPP TypeScript domain boundaries", () => {
  test("extracts complete, fallback, and multi-state XML with incumbent precedence", () => {
    expect(parseFppXml(buildFppXml("complete"))).toMatchObject({
      entryDate: mutationScenarios.entryDate,
      company: mutationScenarios.complete.company,
      street: "Prüfstraße",
      houseNumber: "17a",
      email: mutationScenarios.complete.email,
      phone: mutationScenarios.complete.phone,
      fax: mutationScenarios.complete.fax,
      state: null,
    });
    expect(parseFppXml(buildFppXml("contact-fallback"))).toMatchObject({
      email: mutationScenarios.fallback.email,
      phone: mutationScenarios.fallback.phone,
    });
    expect(parseFppXml(buildFppXml("multi-state")).state).toBe("Bayern, Berlin");
  });

  test("rejects malformed, unsafe, and required-field-incomplete XML explicitly", () => {
    expect(() => parseFppXml(malformedFppXml)).toThrow("Invalid XML failed to parse");
    expect(() => parseFppXml(unsafeFppXml)).toThrow("Unsafe XML input detected");
    expect(() => parseFppXml(buildMissingEntryDateXml())).toThrow(
      "Missing required fields in XML: entry_date (creationDate)",
    );
  });

  test("preserves partial representative contact precedence and rejects impossible dates", () => {
    const partialRepresentative = buildFppXml("minimal").replace(
      "</ffw:root>",
      [
        '<ffw:element id="org_vertreter_np_mailadresse">rep@example.test</ffw:element>',
        '<ffw:element id="projektleiter-telefon">project-phone</ffw:element>',
        '<ffw:element id="ap_kontakt_telefon">ap-phone</ffw:element>',
        "</ffw:root>",
      ].join(""),
    );
    expect(parseFppXml(partialRepresentative)).toMatchObject({
      email: "rep@example.test",
      phone: "ap-phone",
    });

    const impossibleDate = buildFppXml("minimal").replace(
      `${mutationScenarios.entryDate}T09:10:11.000+02:00`,
      "2026-02-30T09:10:11.000+02:00",
    );
    expect(() => parseFppXml(impossibleDate)).toThrow(
      "Missing required fields in XML: entry_date (creationDate)",
    );
  });

  test("allows only secure allowlisted URLs with incumbent wildcard semantics", () => {
    expect(
      validateFileUrl("https://files.fpp.example/plan.zip", {
        allowedDomains: ["*.fpp.example"],
        blockPrivateIps: true,
      }),
    ).toBe("https://files.fpp.example/plan.zip");
    expect(() =>
      validateFileUrl("https://fpp.example/plan.zip", {
        allowedDomains: ["*.fpp.example"],
        blockPrivateIps: true,
      }),
    ).toThrow("not in the allowlist");
    expect(
      validateFileUrl("https://fpp.example/plan.zip", {
        allowedDomains: ["**.fpp.example"],
        blockPrivateIps: true,
      }),
    ).toBe("https://fpp.example/plan.zip");

    for (const value of [
      "http://files.fpp.example/plan.zip",
      "https://user:secret@files.fpp.example/plan.zip",
      "https://not-allowed.example/plan.zip",
    ]) {
      expect(() =>
        validateFileUrl(value, {
          allowedDomains: ["files.fpp.example"],
          blockPrivateIps: true,
        }),
      ).toThrow();
    }
  });

  test.each([
    "https://127.0.0.1/plan.zip",
    "https://100.64.0.1/plan.zip",
    "https://[::ffff:127.0.0.1]/plan.zip",
    "https://[::ffff:10.0.0.1]/plan.zip",
  ])("rejects the allowlisted private address %s when private addresses are blocked", (value) => {
    expect(() =>
      validateFileUrl(value, {
        allowedDomains: [new URL(value).hostname],
        blockPrivateIps: true,
      }),
    ).toThrow("Private/internal IP addresses are not allowed");
  });
});
