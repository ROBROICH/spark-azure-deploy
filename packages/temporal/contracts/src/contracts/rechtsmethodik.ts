import { Type, type Static } from "@sinclair/typebox";

import { GeneratedUUID, type WorkflowName } from "../registry.js";

export const RECHTSMETHODIK_TASK_QUEUE = "rechtsmethodik" as const;
export const RECHTSMETHODIK_WORKFLOW =
  "RechtsmethodikWorkflow" as WorkflowName<"RechtsmethodikWorkflow">;

const nullableString = Type.Union([Type.String(), Type.Null()]);
const object = { additionalProperties: false } as const;
const NormTypSchema = Type.Union([
  Type.Literal("materiell-rechtlich"),
  Type.Literal("verfahrensrechtlich"),
]);
const SatzKategorieSchema = Type.Union([
  Type.Literal("wenn-dann"),
  Type.Literal("abwägungsdirektive"),
  Type.Literal("begriffserklärung"),
  Type.Literal("sonstiges"),
]);
const SollensanordnungenSchema = Type.Union([
  Type.Literal("verbot"),
  Type.Literal("gebot"),
  Type.Literal("erlaubnis"),
  Type.Literal("freistellung"),
]);
const RechtsfolgenAdressatSchema = Type.Union([
  Type.Literal("handlungsermächtigung"),
  Type.Literal("keine handlungsermächtigung"),
]);
const ErmessensspielraumSchema = Type.Union([
  Type.Literal("ermessensentscheidung"),
  Type.Literal("gebundene entscheidung"),
]);
const ErmessensArtSchema = Type.Union([
  Type.Literal("entschließungsermessen"),
  Type.Literal("auswahlermessen"),
  Type.Literal("beides"),
]);
export const SourceSchema = Type.Object(
  { jurabk: Type.String(), paragraphNr: Type.String() },
  { ...object, $id: "Source" },
);

const contracts = Type.Module({
  GeneratedUUID,
  NormTyp: NormTypSchema,
  SatzKategorie: SatzKategorieSchema,
  Sollensanordnungen: SollensanordnungenSchema,
  RechtsfolgenAdressat: RechtsfolgenAdressatSchema,
  Ermessensspielraum: ErmessensspielraumSchema,
  ErmessensArt: ErmessensArtSchema,
  TechnischeNorm: Type.Object({ id: Type.String(), kurzbeschreibung: Type.String() }, object),
  Auslegungsvorschlag: Type.Object(
    {
      auslegungMethode: Type.String(),
      auslegungsvorschlag: Type.String(),
      sources: Type.Optional(Type.Union([Type.Array(Type.String()), Type.Null()])),
    },
    object,
  ),
  UnbestimmterRechtsbegriff: Type.Object(
    {
      begriff: Type.String(),
      auslegungsvorschläge: Type.Array(Type.Ref("Auslegungsvorschlag")),
      auslegung: Type.Optional(nullableString),
    },
    object,
  ),
  Source: SourceSchema,
  Legaldefinition: Type.Object(
    {
      begriff: Type.String(),
      definition: Type.String(),
      source: Type.Ref("Source"),
    },
    object,
  ),
  BestimmterRechtsbegriff: Type.Object(
    {
      begriff: Type.String(),
      definitions: Type.Array(Type.Ref("Legaldefinition")),
      selectedDefinition: Type.Optional(Type.Union([Type.Ref("Legaldefinition"), Type.Null()])),
    },
    object,
  ),
  Rechtsbegriffe: Type.Object(
    {
      unbestimmteRechtsbegriffe: Type.Array(Type.Ref("UnbestimmterRechtsbegriff")),
      bestimmteRechtsbegriffe: Type.Array(Type.Ref("BestimmterRechtsbegriff")),
    },
    object,
  ),
  Untergliederung: Type.Object({ typ: Type.String(), wert: Type.String() }, object),
  ExplicitVerweiseInfo: Type.Object(
    {
      gesetz: Type.Optional(nullableString),
      paragraphNr: Type.Optional(nullableString),
      absatzNr: Type.Optional(nullableString),
      satzNr: Type.Optional(nullableString),
      untergliederung: Type.Optional(
        Type.Union([Type.Array(Type.Ref("Untergliederung")), Type.Null()]),
      ),
      anhang: Type.Optional(nullableString),
      artikel: Type.Optional(nullableString),
      richtlinie: Type.Optional(nullableString),
      verordnung: Type.Optional(nullableString),
      technischeNorm: Type.Optional(Type.Union([Type.Ref("TechnischeNorm"), Type.Null()])),
      verweisTyp: Type.Union([Type.Literal("intern"), Type.Literal("extern"), Type.Null()]),
      kontext: Type.Optional(Type.Union([Type.Array(Type.String()), Type.Null()])),
    },
    object,
  ),
  Verweise: Type.Object(
    {
      explizit: Type.Array(Type.Ref("ExplicitVerweiseInfo")),
      implizit: Type.Array(Type.String()),
    },
    object,
  ),
  AtomaresTBM: Type.Object(
    {
      id: Type.Ref("GeneratedUUID"),
      text: Type.String(),
      verweise: Type.Ref("Verweise"),
      prueffrage: Type.String(),
      pruefgegenstand: Type.String(),
      rechtsbegriffe: Type.Ref("Rechtsbegriffe"),
    },
    object,
  ),
  Rechtsfolge: Type.Object(
    {
      text: Type.String(),
      sollensanordnungen: Type.Ref("Sollensanordnungen"),
      rechtsfolgenAdressat: Type.Ref("RechtsfolgenAdressat"),
      ermessensspielraum: Type.Optional(Type.Union([Type.Ref("Ermessensspielraum"), Type.Null()])),
      ermessensart: Type.Optional(Type.Union([Type.Ref("ErmessensArt"), Type.Null()])),
      verweise: Type.Optional(Type.Union([Type.Ref("Verweise"), Type.Null()])),
    },
    object,
  ),
  RechtsmethodikWorkflowInput: Type.Object(
    { jurabk: Type.String(), paragraphNr: Type.String() },
    object,
  ),
  RechtsmethodikWorkflowSatzOutput: Type.Object(
    {
      id: Type.Ref("GeneratedUUID"),
      satzNr: Type.String(),
      markers: Type.Array(Type.String()),
      satzText: Type.String(),
      normTypLvl1: Type.Ref("NormTyp"),
      normTypLvl2: Type.Optional(Type.Union([Type.Ref("SatzKategorie"), Type.Null()])),
      tatbestandsmerkmale: Type.Optional(Type.Union([Type.Array(Type.String()), Type.Null()])),
      rechtsfolge: Type.Optional(Type.Union([Type.Ref("Rechtsfolge"), Type.Null()])),
      atomareTatbestandsmerkmale: Type.Optional(
        Type.Union([Type.Array(Type.Ref("AtomaresTBM")), Type.Null()]),
      ),
      formel: Type.Optional(nullableString),
    },
    object,
  ),
  RechtsmethodikAbsatz: Type.Object(
    {
      absatzNr: Type.String(),
      absatzText: Type.String(),
      saetze: Type.Array(Type.Ref("RechtsmethodikWorkflowSatzOutput")),
    },
    object,
  ),
  RechtsmethodikWorkflowOutput: Type.Object(
    {
      gesetz: Type.String(),
      jurabk: Type.String(),
      standangaben: Type.Array(
        Type.Record(
          Type.String(),
          Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]),
        ),
      ),
      paragraphNr: Type.String(),
      paragraphTitel: Type.String(),
      paragraphText: Type.String(),
      absaetze: Type.Array(Type.Ref("RechtsmethodikAbsatz")),
      regelungsgegenstand: Type.Optional(nullableString),
    },
    object,
  ),
  LMAtomareTBMsWorkflowInput: Type.Object(
    {
      gesetz: Type.String(),
      jurabk: Type.String(),
      paragraphNr: Type.String(),
      paragraphText: Type.String(),
      absatzNr: Type.String(),
      satzNr: Type.String(),
      markers: Type.Array(Type.String()),
      satzText: Type.String(),
      exAtomareTatbestandsmerkmale: Type.Array(Type.String()),
      newAtomareTatbestandsmerkmale: Type.Array(Type.String()),
      rechtsfolge: Type.String(),
    },
    object,
  ),
  LMAtomareTBMsWorkflowOutput: Type.Object(
    {
      atomareTatbestandsmerkmale: Type.Optional(
        Type.Union([Type.Array(Type.Ref("AtomaresTBM")), Type.Null()]),
      ),
      formel: Type.Optional(nullableString),
    },
    object,
  ),
  LMJuristischerSatzWorkflowInput: Type.Object(
    {
      gesetz: Type.String(),
      jurabk: Type.String(),
      paragraphNr: Type.String(),
      paragraphText: Type.String(),
      absatzNr: Type.String(),
      satzNr: Type.String(),
      markers: Type.Array(Type.String()),
      satzText: Type.String(),
    },
    object,
  ),
  LMJuristischerSatzWorkflowOutput: Type.Object(
    {
      normTypLvl1: Type.Ref("NormTyp"),
      normTypLvl2: Type.Optional(Type.Union([Type.Ref("SatzKategorie"), Type.Null()])),
      tatbestandsmerkmale: Type.Optional(Type.Union([Type.Array(Type.String()), Type.Null()])),
      atomareTatbestandsmerkmale: Type.Optional(
        Type.Union([Type.Array(Type.Ref("AtomaresTBM")), Type.Null()]),
      ),
      rechtsfolge: Type.Optional(Type.Union([Type.Ref("Rechtsfolge"), Type.Null()])),
      formel: Type.Optional(nullableString),
    },
    object,
  ),
  LMMateriellRechtlichWorkflowOutput: Type.Object(
    {
      normTypLvl2: Type.Ref("SatzKategorie"),
      tatbestandsmerkmale: Type.Optional(Type.Union([Type.Array(Type.String()), Type.Null()])),
      atomareTatbestandsmerkmale: Type.Optional(
        Type.Union([Type.Array(Type.Ref("AtomaresTBM")), Type.Null()]),
      ),
      rechtsfolge: Type.Optional(Type.Union([Type.Ref("Rechtsfolge"), Type.Null()])),
      formel: Type.Optional(nullableString),
    },
    object,
  ),
  LMRfWorkflowInput: Type.Object(
    {
      gesetz: Type.String(),
      paragraphNr: Type.String(),
      absatzNr: Type.String(),
      satzNr: Type.String(),
      satzText: Type.String(),
      rechtsfolge: Type.String(),
    },
    object,
  ),
  LMWennDannWorkflowOutput: Type.Object(
    {
      tatbestandsmerkmale: Type.Optional(Type.Union([Type.Array(Type.String()), Type.Null()])),
      atomareTatbestandsmerkmale: Type.Optional(
        Type.Union([Type.Array(Type.Ref("AtomaresTBM")), Type.Null()]),
      ),
      rechtsfolge: Type.Optional(Type.Union([Type.Ref("Rechtsfolge"), Type.Null()])),
      formel: Type.Optional(nullableString),
    },
    object,
  ),
  LMHandlungsermaechtigungWorkflowInput: Type.Object({ rechtsfolge: Type.String() }, object),
});

export const AtomaresTBM = contracts.Import("AtomaresTBM");
export const Auslegungsvorschlag = contracts.Import("Auslegungsvorschlag");
export const BestimmterRechtsbegriff = contracts.Import("BestimmterRechtsbegriff");
export const ErmessensArt = contracts.Import("ErmessensArt");
export const Ermessensspielraum = contracts.Import("Ermessensspielraum");
export const ExplicitVerweiseInfo = contracts.Import("ExplicitVerweiseInfo");
export const Legaldefinition = contracts.Import("Legaldefinition");
export const LMAtomareTBMsWorkflowInput = contracts.Import("LMAtomareTBMsWorkflowInput");
export const LMAtomareTBMsWorkflowOutput = contracts.Import("LMAtomareTBMsWorkflowOutput");
export const LMHandlungsermaechtigungWorkflowInput = contracts.Import(
  "LMHandlungsermaechtigungWorkflowInput",
);
export const LMJuristischerSatzWorkflowInput = contracts.Import("LMJuristischerSatzWorkflowInput");
export const LMJuristischerSatzWorkflowOutput = contracts.Import(
  "LMJuristischerSatzWorkflowOutput",
);
export const LMMateriellRechtlichWorkflowOutput = contracts.Import(
  "LMMateriellRechtlichWorkflowOutput",
);
export const LMRfWorkflowInput = contracts.Import("LMRfWorkflowInput");
export const LMWennDannWorkflowOutput = contracts.Import("LMWennDannWorkflowOutput");
export const NormTyp = contracts.Import("NormTyp");
export const Rechtsbegriffe = contracts.Import("Rechtsbegriffe");
export const Rechtsfolge = contracts.Import("Rechtsfolge");
export const RechtsfolgenAdressat = contracts.Import("RechtsfolgenAdressat");
export const RechtsmethodikWorkflowInput = contracts.Import("RechtsmethodikWorkflowInput");
export const RechtsmethodikWorkflowOutput = contracts.Import("RechtsmethodikWorkflowOutput");
export const RechtsmethodikWorkflowSatzOutput = contracts.Import(
  "RechtsmethodikWorkflowSatzOutput",
);
export const SatzKategorie = contracts.Import("SatzKategorie");
export const Sollensanordnungen = contracts.Import("Sollensanordnungen");
export const Source = contracts.Import("Source");
export const TechnischeNorm = contracts.Import("TechnischeNorm");
export const UnbestimmterRechtsbegriff = contracts.Import("UnbestimmterRechtsbegriff");
export const Untergliederung = contracts.Import("Untergliederung");
export const Verweise = contracts.Import("Verweise");

export type AtomaresTBM = Static<typeof AtomaresTBM>;
export type Rechtsfolge = Static<typeof Rechtsfolge>;
export type Verweise = Static<typeof Verweise>;
export type RechtsmethodikWorkflowInput = Static<typeof RechtsmethodikWorkflowInput>;
export type RechtsmethodikWorkflowOutput = Static<typeof RechtsmethodikWorkflowOutput>;
