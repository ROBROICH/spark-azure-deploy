import type { Usecase } from '../data/usecaseApi';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const unwrapClientPayload = (result: unknown): unknown => {
  if (isRecord(result) && 'data' in result) {
    return result.data;
  }

  return result;
};

const isDocumentType = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.description === 'string' &&
  (typeof value.expected_count === 'number' || value.expected_count === null);

const isDocumentCategory = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.category === 'string' &&
  Array.isArray(value.document_types) &&
  value.document_types.every(isDocumentType);

const isUsecase = (value: unknown): value is Usecase => {
  if (!isRecord(value)) {
    return false;
  }

  const projekttyp = value.projekttyp;
  const gesetzesgrundlage = value.gesetzesgrundlage;
  const dokumente = value.dokumente;
  const beschluss = value.beschluss;

  return (
    typeof value.slug === 'string' &&
    typeof value.updatedAt === 'string' &&
    isRecord(projekttyp) &&
    typeof projekttyp.id === 'string' &&
    typeof projekttyp.name === 'string' &&
    isRecord(gesetzesgrundlage) &&
    Array.isArray(gesetzesgrundlage.topics) &&
    isRecord(gesetzesgrundlage.stateNormGroups) &&
    isRecord(gesetzesgrundlage.topicStateGroups) &&
    isRecord(dokumente) &&
    Array.isArray(dokumente.categories) &&
    dokumente.categories.every(isDocumentCategory) &&
    isRecord(beschluss) &&
    Array.isArray(beschluss.nodes)
  );
};

/**
 * Reads a catalog usecase out of the PLS client envelope (`{ data }`) or a
 * bare document. Invalid payloads fail at this boundary instead of entering
 * the editor.
 *
 * @param result Client `get`/`post`/`put` result from `usecaseApi`.
 * @returns The validated usecase document.
 */
export const readUsecaseResponse = (result: unknown): Usecase => {
  const payload = unwrapClientPayload(result);

  if (!isUsecase(payload)) {
    throw new Error('Catalog usecase response is invalid');
  }

  return payload;
};
