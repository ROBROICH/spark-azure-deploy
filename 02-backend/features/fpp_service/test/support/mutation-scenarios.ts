import { type Static, Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import fixture from "../../fixtures/mutation-scenarios.json";
const FileTypeSchema = T.Union([T.Literal("PLANUNTERLAGEN"), T.Literal("ERGAENZENDE_UNTERLAGEN")]);
const ScenarioFileSchema = T.Object(
  {
    fileType: FileTypeSchema,
    fileUrl: T.String({ pattern: "^https://" }),
    fileName: T.Union([T.String({ minLength: 1 }), T.Null()]),
  },
  { additionalProperties: false },
);
const MutationScenariosSchema = T.Object(
  {
    allowedDomain: T.String({ minLength: 1 }),
    entryDate: T.String({ pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }),
    complete: T.Object(
      {
        company: T.String(),
        country: T.String(),
        address: T.String(),
        postalCode: T.String(),
        location: T.String(),
        addressAddition: T.String(),
        email: T.String(),
        phone: T.String(),
        fax: T.String(),
      },
      { additionalProperties: false },
    ),
    fallback: T.Object({ email: T.String(), phone: T.String() }, { additionalProperties: false }),
    states: T.Tuple([T.Literal("02"), T.Literal("03")]),
    files: T.Tuple([ScenarioFileSchema, ScenarioFileSchema, ScenarioFileSchema]),
  },
  { additionalProperties: false },
);

export type MutationScenarios = Static<typeof MutationScenariosSchema>;
export const mutationScenarios: MutationScenarios = Value.Parse(MutationScenariosSchema, fixture);

const escapeXml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const element = (id: string, value: string): string =>
  `<ffw:element id="${id}">${escapeXml(value)}</ffw:element>`;

export type XmlVariant = "complete" | "minimal" | "contact-fallback" | "multi-state";

export function buildFppXml(variant: XmlVariant): string {
  const values = [
    element("aktenzeichen_eingabe", "XML-VALUE-MUST-NOT-WIN"),
    element("v-bezeichnung", "XML name must not win"),
    element("creationDate", `${mutationScenarios.entryDate}T09:10:11.000+02:00`),
  ];

  if (variant === "complete") {
    values.push(
      element("vertreter_org_name", mutationScenarios.complete.company),
      element("vertreter_anschrift_land", mutationScenarios.complete.country),
      element("vertreter_anschrift_hausnummer", mutationScenarios.complete.address),
      element("vertreter_anschrift_postleitzahl", mutationScenarios.complete.postalCode),
      element("vertreter_anschrift_ort", mutationScenarios.complete.location),
      element("vertreter_anschrift_zusatz", mutationScenarios.complete.addressAddition),
      element("org_vertreter_np_mailadresse", mutationScenarios.complete.email),
      element("vertreter_np_telefonnummer", mutationScenarios.complete.phone),
      element("projektleiter-fax", mutationScenarios.complete.fax),
    );
  }

  if (variant === "contact-fallback") {
    values.push(
      element("ap_kontakt_email", mutationScenarios.fallback.email),
      element("ap_kontakt_telefon", mutationScenarios.fallback.phone),
    );
  }

  const stateRows =
    variant === "multi-state"
      ? `<ffw:dataset id="Linked_Gebiet">${mutationScenarios.states
          .map((state) => `<ffw:datarow>${element("gebiet_bundesland", state)}</ffw:datarow>`)
          .join("")}</ffw:dataset>`
      : "";

  return `<ffw:root xmlns:ffw="http://www.lucom.com/ffw/xml-data-1.0.xsd">${values.join("")}${stateRows}</ffw:root>`;
}

export const malformedFppXml = "<ffw:root><ffw:element";
export const unsafeFppXml = `<?xml version="1.0"?><!DOCTYPE data [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><data>&xxe;</data>`;

export function buildMissingEntryDateXml(): string {
  return `<ffw:root xmlns:ffw="http://www.lucom.com/ffw/xml-data-1.0.xsd">${element("v-bezeichnung", "Missing date")}</ffw:root>`;
}

export function buildImportRequest(
  requestId: string,
  internalProjectId: string,
  variant: XmlVariant,
  files: readonly MutationScenarios["files"][number][] = [],
) {
  return {
    requestId: requestId,
    internalProjectId: internalProjectId,
    name: `FPP test ${internalProjectId}`,
    xml: buildFppXml(variant),
    files: files.map(({ fileType, fileUrl, fileName }) => ({
      fileType: fileType,
      fileUrl: fileUrl,
      fileName: fileName,
    })),
  };
}
