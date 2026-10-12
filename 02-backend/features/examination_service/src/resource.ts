import { isoInstant } from "@spark-workflow/http-host";
import {
  createNodeVersionService,
  createNodeBatchReader,
  type NodeBatchReader,
  mutateNodes,
  trustedServiceAuthorization,
  type NodeMutationInput,
  type NodeMutationResult,
  type NodeVersionService,
} from "@spark-workflow/node-crud";
import {
  providePostgresTable,
  type PostgresTableResource,
} from "@spark-workflow/postgres-runtime/table-resource";
import { defineResource, provide } from "@spark-workflow/resource";
import type { Static } from "@sinclair/typebox";
import type { RechtsmethodikWorkflowOutput } from "@spark-temporal/contracts";

import { NormDeconstructionResponseSchema } from "./contracts.ts";
import { examinationSchema, examinationNodeTables } from "./db/schema.ts";
import { ExaminationNodes } from "./node/descriptor.ts";
import {
  replaceAssessment,
  replaceFundstellen,
  type AssessmentReplacement,
  type FundstellenReplacement,
} from "./resource/processing.ts";

export { examinationErrors } from "./errors.ts";
export {
  processingSourceDigest,
  type AssessmentReplacement,
  type FundstellenReplacement,
  type ProcessingSourceRevision,
} from "./resource/processing.ts";

type NormDeconstructionResponse = Static<typeof NormDeconstructionResponseSchema>;
export interface NormDeconstructionInput {
  readonly jurabk: string;
  readonly paragraph: string;
  readonly deconstruction: RechtsmethodikWorkflowOutput;
}

export interface ExaminationService extends NodeVersionService {
  batchNodes: NodeBatchReader<typeof examinationNodeTables>;
  replaceAssessment(
    projectId: string,
    projectVersion: number,
    input: AssessmentReplacement,
  ): Promise<{ nodesInserted: number }>;
  replaceFundstellen(
    projectId: string,
    projectVersion: number,
    input: FundstellenReplacement,
  ): Promise<{ fundstellenInserted: number }>;
  updateNodes(
    projectId: string,
    projectVersion: number,
    input: NodeMutationInput,
  ): Promise<NodeMutationResult>;
  getNormDeconstructions(jurabk: string, paragraph: string): Promise<NormDeconstructionResponse[]>;
  saveNormDeconstructions(
    inputs: readonly NormDeconstructionInput[],
  ): Promise<NormDeconstructionResponse[]>;
}

export const ExaminationVersioning = defineResource<ExaminationService>()("examination/Versioning");

type NormDeconstructionTable = typeof examinationSchema.normDeconstruction;
type NormDeconstructionRow = NormDeconstructionTable["$inferSelect"];
type NormDeconstructionTableService = PostgresTableResource<
  NormDeconstructionTable,
  "jurabk" | "paragraph",
  "jurabk" | "paragraph"
>;

const NormDeconstructions = defineResource<NormDeconstructionTableService>()(
  "examination/NormDeconstructions",
);

export const normDeconstructionsProvider = providePostgresTable({
  resource: NormDeconstructions,
  table: examinationSchema.normDeconstruction,
  identity: ["jurabk", "paragraph"],
  filterFields: ["jurabk", "paragraph"],
  schema: examinationSchema,
});

const presentNormDeconstruction = (row: NormDeconstructionRow): NormDeconstructionResponse => ({
  id: row.id,
  jurabk: row.jurabk,
  paragraph: row.paragraph,
  deconstruction: row.deconstruction,
  createdAt: isoInstant(row.createdAt),
});

export const examinationVersioningProvider = provide({
  resource: ExaminationVersioning,
  needs: { normDeconstructions: NormDeconstructions, nodes: ExaminationNodes },
  make: ({ normDeconstructions, nodes }) => {
    const getNormDeconstructions = async (jurabk: string, paragraph: string) => {
      const rows = await normDeconstructions.findMany({
        where: {
          kind: "and",
          filters: [
            { kind: "eq", field: "jurabk", value: jurabk },
            { kind: "eq", field: "paragraph", value: paragraph },
          ],
        },
      });
      return rows.map(presentNormDeconstruction);
    };
    const saveNormDeconstructions = async (inputs: readonly NormDeconstructionInput[]) => {
      if (inputs.length === 0) return [];
      const changed = await normDeconstructions.upsertMany({
        data: inputs.map(
          (input) =>
            ({
              id: crypto.randomUUID(),
              jurabk: input.jurabk,
              paragraph: input.paragraph,
              deconstruction: input.deconstruction,
            }) satisfies NormDeconstructionTable["$inferInsert"],
        ),
        update: ["deconstruction"],
      });
      return (changed.data ?? []).map(presentNormDeconstruction);
    };
    return Object.freeze<ExaminationService>({
      ...createNodeVersionService(nodes),
      batchNodes: createNodeBatchReader(nodes, examinationNodeTables),
      async updateNodes(projectId, projectVersion, input) {
        const result = await mutateNodes(
          nodes,
          trustedServiceAuthorization,
          projectId,
          projectVersion,
          input,
        );
        if (result.isErr()) throw result.error;
        return result.value;
      },
      replaceAssessment: (projectId, projectVersion, input) =>
        replaceAssessment(nodes, projectId, projectVersion, input),
      replaceFundstellen: (projectId, projectVersion, input) =>
        replaceFundstellen(nodes, projectId, projectVersion, input),
      getNormDeconstructions,
      saveNormDeconstructions,
    });
  },
});
