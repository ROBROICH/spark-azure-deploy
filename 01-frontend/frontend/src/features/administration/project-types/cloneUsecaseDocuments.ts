import { invariant } from 'es-toolkit/util';

import type {
  BeschlussNode,
  createCatalogUsecase,
  DokumenteDocument,
  Usecase,
} from '../data/usecaseApi';

export type CloneIdFactory = () => string;

export type ClonedUsecaseDocuments = Parameters<typeof createCatalogUsecase>[0];

const mappedId = (
  sourceId: string,
  idMap: ReadonlyMap<string, string>,
): string => {
  const nextId = idMap.get(sourceId);
  invariant(nextId !== undefined, 'Cloned identifier is missing');
  return nextId;
};

const remapIds = (
  sourceIds: ReadonlyArray<string>,
  createId: CloneIdFactory,
): Map<string, string> => {
  const idMap = new Map<string, string>();

  for (const sourceId of sourceIds) {
    idMap.set(sourceId, createId());
  }

  return idMap;
};

const cloneDokumenteDocument = (
  document: DokumenteDocument,
  createId: CloneIdFactory,
): DokumenteDocument => {
  const categoryIds = remapIds(
    document.categories.map((category) => category.id),
    createId,
  );
  const documentTypeIds = remapIds(
    document.categories.flatMap((category) =>
      category.document_types.map((documentType) => documentType.id),
    ),
    createId,
  );

  return {
    categories: document.categories.map((category) => ({
      ...category,
      id: mappedId(category.id, categoryIds),
      document_types: category.document_types.map((documentType) => ({
        ...documentType,
        id: mappedId(documentType.id, documentTypeIds),
      })),
    })),
  };
};

const cloneBeschlussNodes = (
  nodes: ReadonlyArray<BeschlussNode>,
  createId: CloneIdFactory,
): BeschlussNode[] => {
  const nodeIds = remapIds(
    nodes.map((node) => node.id),
    createId,
  );

  return nodes.map((node) => ({
    ...node,
    id: mappedId(node.id, nodeIds),
    parent_vae_node_id: node.parent_vae_node_id
      ? mappedId(node.parent_vae_node_id, nodeIds)
      : null,
  }));
};

/**
 * Builds a create payload for a duplicated project type. Category, document-type,
 * and decision-node identifiers are regenerated so the clone owns an independent
 * tree. A non-null parent that is not in that tree fails closed instead of
 * becoming a new root.
 */
export const cloneUsecaseDocuments = (
  source: Usecase,
  projectType: { id: string; name: string },
  createId: CloneIdFactory = () => crypto.randomUUID(),
): ClonedUsecaseDocuments => ({
  projekttyp: {
    id: projectType.id,
    name: projectType.name,
  },
  gesetzesgrundlage: structuredClone(source.gesetzesgrundlage),
  dokumente: cloneDokumenteDocument(source.dokumente, createId),
  beschluss: {
    nodes: cloneBeschlussNodes(source.beschluss.nodes, createId),
  },
});
