import type { Usecase } from "./formats.ts";

export {
  defaultUsecaseDirectory,
  loadUsecases,
  resolveUsecaseDirectory,
  usecaseDirectoryExists,
} from "./load.ts";
export {
  BeschlussDocument,
  DokumenteDocument,
  GesetzesgrundlageDocument,
  ProjekttypDocument,
  UsecaseIdParamsSchema,
  UsecaseDocumentType,
  UsecaseDocumentTypes,
  UsecaseCatalogSchema,
  UsecaseCatalogResponseSchema,
  UsecaseResponseSchema,
  UsecaseUpdateSchema,
  UsecaseSchema,
  UsecaseWriteSchema,
} from "./formats.ts";
export type {
  BeschlussDocument as BeschlussDocumentValue,
  BeschlussNode,
  DokumenteDocument as DokumenteDocumentValue,
  GesetzesgrundlageDocument as GesetzesgrundlageDocumentValue,
  ProjekttypDocument as ProjekttypDocumentValue,
  UsecaseDocumentType as UsecaseDocumentTypeValue,
  Usecase,
  UsecaseCatalog,
  UsecaseCatalogResponse,
  UsecaseResponse,
  UsecaseUpdate,
  UsecaseWrite,
} from "./formats.ts";
export { errorFromCatalogHttp, usecaseErrors } from "./errors.ts";
export { REQUIRED_FILES, validateCatalog, validateUsecase } from "./validate.ts";
export { usecaseDocuments, usecaseSchema, toUsecaseDocumentRows } from "./schema.ts";
export type { UsecaseDatabaseSchema, UsecaseDocumentRow } from "./schema.ts";
export {
  catalogFromRows,
  createUsecase,
  deleteUsecase,
  getUsecase,
  listCatalog,
  updateUsecase,
} from "./catalog.ts";
export type { UsecaseDocumentRecord } from "./catalog.ts";
export { createUsecaseCatalogRoutes, createUsecaseV2Routes } from "./routes.ts";
export { seedUsecaseCatalog } from "./seed.ts";
export { createUsecasesService, Usecases, type UsecasesService } from "./resource.ts";

export type ResolvedTopic = {
  readonly name: string;
  readonly description: string;
  readonly showInMvp: boolean;
  readonly showInEwm: boolean;
  readonly showInBeschluss: boolean;
  readonly norms: readonly {
    readonly jurabk: string;
    readonly paragraphNr: string | null;
    readonly absatz: string | null;
    readonly satz: string | null;
    readonly nummer: string | null;
    readonly type: "PRUEFUNG" | "VERFAHREN";
  }[];
  readonly subtopics: readonly Omit<ResolvedTopic, "subtopics">[];
};

const typedNorms = (
  norms: Usecase["gesetzesgrundlage"]["topics"][number]["pruefungsNorms"],
  type: "PRUEFUNG" | "VERFAHREN",
) => norms.map((norm) => ({ ...norm, type }));

const normsFor = (value: {
  readonly pruefungsNorms: Usecase["gesetzesgrundlage"]["topics"][number]["pruefungsNorms"];
  readonly verfahrensNorms: Usecase["gesetzesgrundlage"]["topics"][number]["verfahrensNorms"];
}) => [
  ...typedNorms(value.pruefungsNorms, "PRUEFUNG"),
  ...typedNorms(value.verfahrensNorms, "VERFAHREN"),
];

export const topicNormKey = (norm: ResolvedTopic["norms"][number]): string =>
  JSON.stringify([
    norm.jurabk,
    norm.paragraphNr ?? "",
    norm.absatz,
    norm.satz,
    norm.nummer,
    norm.type,
  ]);

const dedupeNorms = (norms: ResolvedTopic["norms"]): ResolvedTopic["norms"] => {
  const result = new Map<string, ResolvedTopic["norms"][number]>();
  for (const norm of norms) {
    const key = topicNormKey(norm);
    if (!result.has(key)) result.set(key, norm);
  }
  return [...result.values()];
};

export const findUsecaseByProjectTypeName = (
  usecases: readonly Usecase[],
  projectTypeName: string,
): Usecase | undefined => usecases.find((usecase) => usecase.projekttyp.name === projectTypeName);

export const topicsForUsecase = (
  usecase: Usecase,
  stateCode: string | null,
): readonly ResolvedTopic[] =>
  usecase.gesetzesgrundlage.topics.map((topic) => {
    const stateNorms =
      stateCode === null
        ? []
        : (usecase.gesetzesgrundlage.topicStateGroups[topic.name] ?? []).flatMap(
            (group) => usecase.gesetzesgrundlage.stateNormGroups[`${group}|${stateCode}`] ?? [],
          );
    return {
      name: topic.name,
      description: topic.description,
      showInMvp: topic.showInMvp,
      showInEwm: topic.showInEwm,
      showInBeschluss: topic.showInBeschluss,
      norms: dedupeNorms([...normsFor(topic), ...typedNorms(stateNorms, "PRUEFUNG")]),
      subtopics: topic.subtopics.map((subtopic) => ({
        name: subtopic.name,
        description: subtopic.description,
        showInMvp: subtopic.showInMvp,
        showInEwm: subtopic.showInEwm,
        showInBeschluss: subtopic.showInBeschluss,
        norms: normsFor(subtopic),
      })),
    };
  });
