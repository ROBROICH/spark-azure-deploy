import {
  v1ProjectLogicCreateCatalogUsecase as createCatalogUsecaseRequest,
  v1ProjectLogicGetCatalogUsecase as getCatalogUsecaseRequest,
  v1ProjectLogicListCatalogUsecases as listCatalogUsecasesRequest,
  v1ProjectLogicUpdateCatalogUsecase as updateCatalogUsecaseRequest,
} from '@/api-clients/backend/sdk.gen';
import type {
  V1ProjectLogicGetCatalogUsecaseResponse as GetCatalogUsecaseResponse,
  V1ProjectLogicListCatalogUsecasesResponse as ListCatalogUsecasesResponse,
  V1ProjectLogicUpdateCatalogUsecaseData as UpdateCatalogUsecaseData,
} from '@/api-clients/backend/types.gen';

type GeneratedUsecase = GetCatalogUsecaseResponse;
type GeneratedGesetzesgrundlageDocument = GeneratedUsecase['gesetzesgrundlage'];
type GeneratedDokumenteDocument = GeneratedUsecase['dokumente'];
type GeneratedDocumentType =
  GeneratedDokumenteDocument['categories'][number]['document_types'][number];

export type CatalogNorm =
  GeneratedUsecase['gesetzesgrundlage']['topics'][number]['pruefungsNorms'][number];
export type CatalogSubtopic =
  GeneratedUsecase['gesetzesgrundlage']['topics'][number]['subtopics'][number];
export type CatalogTopic =
  GeneratedUsecase['gesetzesgrundlage']['topics'][number];
export type ProjekttypDocument = GeneratedUsecase['projekttyp'];
export type GesetzesgrundlageDocument = Omit<
  GeneratedGesetzesgrundlageDocument,
  'stateNormGroups' | 'topicStateGroups'
> & {
  stateNormGroups: Record<string, CatalogNorm[]>;
  topicStateGroups: Record<string, string[]>;
};

type DokumenteDocumentType = Omit<GeneratedDocumentType, 'expected_count'> & {
  expected_count: number | null;
};

export type DokumenteDocument = Omit<
  GeneratedDokumenteDocument,
  'categories'
> & {
  categories: (Omit<
    GeneratedDokumenteDocument['categories'][number],
    'document_types'
  > & {
    document_types: DokumenteDocumentType[];
  })[];
};

export type BeschlussNode = GeneratedUsecase['beschluss']['nodes'][number];
export type BeschlussDocument = GeneratedUsecase['beschluss'];

export type Usecase = Omit<
  GeneratedUsecase,
  'gesetzesgrundlage' | 'dokumente'
> & {
  gesetzesgrundlage: GesetzesgrundlageDocument;
  dokumente: DokumenteDocument;
};

export type UsecaseWrite = Omit<
  UpdateCatalogUsecaseData['body'],
  'gesetzesgrundlage' | 'dokumente'
> & {
  gesetzesgrundlage: GesetzesgrundlageDocument;
  dokumente: DokumenteDocument;
};

export type UsecaseCatalog = Omit<ListCatalogUsecasesResponse, 'usecases'> & {
  usecases: Usecase[];
};

export const listCatalogUsecases = () =>
  listCatalogUsecasesRequest({ throwOnError: true });

export const getCatalogUsecase = (usecaseId: string) =>
  getCatalogUsecaseRequest({
    path: { usecaseId },
    throwOnError: true,
  });

export const createCatalogUsecase = (
  body: Parameters<typeof createCatalogUsecaseRequest<true>>[0]['body'],
) =>
  createCatalogUsecaseRequest({
    body,
    throwOnError: true,
  });

export const updateCatalogUsecase = (usecaseId: string, body: UsecaseWrite) =>
  updateCatalogUsecaseRequest({
    path: { usecaseId },
    body,
    throwOnError: true,
  });
