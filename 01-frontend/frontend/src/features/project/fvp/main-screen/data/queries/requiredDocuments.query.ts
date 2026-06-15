import { getRequiredDocumentTypesProjectIdRequiredDocumentTypesGetOptions } from '@/api-clients/fcs-module/@tanstack/react-query.gen';
import type {
  CategoryRequiredDocumentsResponse,
  RequiredDocumentTypesResponse,
} from '@/api-clients/fcs-module/types.gen';
import {
  requiredDocumentSchema,
  type RequiredDocument,
} from '../schemas/requiredDocument.schema';

export const getRequiredDocumentTypesResponseQueryOptions = (
  projectId: string,
) =>
  getRequiredDocumentTypesProjectIdRequiredDocumentTypesGetOptions({
    path: { project_id: projectId },
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
        id: category.category_id,
        name: category.category_name,
        parentId: null,
        isCategory: true,
        origin: null,
        isResolved: false,
      }),
    );

    category.required_documents.forEach((document) => {
      items.push(
        requiredDocumentSchema.parse({
          projectId,
          id: document.document_type_id,
          name: document.document_name,
          parentId: category.category_id,
          isCategory: false,
          origin: document.origin,
          isResolved: document.is_resolved,
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
    for (const requiredDocument of category.required_documents) {
      typeIdToName.set(
        requiredDocument.document_type_id,
        requiredDocument.document_name,
      );
    }
  }

  return typeIdToName;
};
