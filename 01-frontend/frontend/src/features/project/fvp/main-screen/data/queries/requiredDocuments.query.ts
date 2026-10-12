import { v1FormalCompletenessGetRequiredDocumentTypesOptions as getRequiredDocumentTypesOptions } from '@/api-clients/backend/@tanstack/react-query.gen';
import type { RequiredDocumentTypesResponse } from '@/api-clients/backend/types.gen';
import {
  requiredDocumentSchema,
  type RequiredDocument,
} from '../schemas/requiredDocument.schema';

type CategoryRequiredDocumentsResponse =
  RequiredDocumentTypesResponse['categories'][number];

export const getRequiredDocumentTypesResponseQueryOptions = (
  projectId: string,
) =>
  getRequiredDocumentTypesOptions({
    path: { projectId: projectId },
  });

export const flattenRequiredDocuments = (
  projectId: string,
  categories: CategoryRequiredDocumentsResponse[],
): RequiredDocument[] => {
  const items: RequiredDocument[] = [];

  categories.forEach((category) => {
    items.push(
      requiredDocumentSchema.parse({
        projectId,
        id: category.categoryId,
        name: category.categoryName,
        parentId: null,
        isCategory: true,
        origin: null,
        isResolved: false,
      }),
    );

    category.requiredDocuments.forEach((document) => {
      items.push(
        requiredDocumentSchema.parse({
          projectId,
          id: document.documentTypeId,
          name: document.documentName,
          parentId: category.categoryId,
          isCategory: false,
          origin: document.origin,
          isResolved: document.isResolved,
        }),
      );
    });
  });

  return items;
};

export const getRequiredDocumentTypeNameMap = (
  response: RequiredDocumentTypesResponse,
) => {
  const typeIdToName = new Map<string, string>();

  for (const category of response.categories) {
    for (const requiredDocument of category.requiredDocuments) {
      typeIdToName.set(
        requiredDocument.documentTypeId,
        requiredDocument.documentName,
      );
    }
  }

  return typeIdToName;
};
