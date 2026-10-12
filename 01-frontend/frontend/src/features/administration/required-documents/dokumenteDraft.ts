import { invariant } from 'es-toolkit/util';

import type { DokumenteDocument } from '../data/usecaseApi';
import {
  findDuplicateDocumentTypeName,
  isBlankName,
  type DokumenteDraftIssue,
} from './dokumenteDraftValidation';

export type DocumentTypePatch = {
  name?: string;
  description?: string;
  expected_count?: number | null;
};

export type DokumenteDraftState = {
  document: DokumenteDocument;
  lastRefusal: DokumenteDraftIssue | null;
};

export type DokumenteDraftAction =
  | { type: 'replace'; document: DokumenteDocument }
  | { type: 'addCategory'; name: string }
  | { type: 'renameCategory'; categoryIndex: number; name: string }
  | { type: 'removeCategory'; categoryIndex: number }
  | { type: 'addDocumentType'; categoryIndex: number; name: string }
  | {
      type: 'updateDocumentType';
      categoryIndex: number;
      typeIndex: number;
      patch: DocumentTypePatch;
    }
  | { type: 'removeDocumentType'; categoryIndex: number; typeIndex: number };

export const createDokumenteDraftState = (
  document: DokumenteDocument,
): DokumenteDraftState => ({
  document: structuredClone(document),
  lastRefusal: null,
});

const refuse = (
  state: DokumenteDraftState,
  lastRefusal: DokumenteDraftIssue,
): DokumenteDraftState => ({ ...state, lastRefusal });

const withDocument = (
  state: DokumenteDraftState,
  document: DokumenteDocument,
): DokumenteDraftState => ({
  ...state,
  document,
  lastRefusal: null,
});

const requireCategory = (
  document: DokumenteDocument,
  categoryIndex: number,
) => {
  const category = document.categories[categoryIndex];
  invariant(category !== undefined, 'Document category index is out of range');
  return category;
};

const replaceCategory = (
  document: DokumenteDocument,
  categoryIndex: number,
  category: DokumenteDocument['categories'][number],
): DokumenteDocument => ({
  categories: document.categories.map((candidate, index) =>
    index === categoryIndex ? category : candidate,
  ),
});

const addCategory = (
  state: DokumenteDraftState,
  name: string,
): DokumenteDraftState => {
  if (isBlankName(name)) {
    return refuse(state, { code: 'emptyCategoryName', categoryIndex: -1 });
  }

  return withDocument(state, {
    categories: [
      ...state.document.categories,
      { id: crypto.randomUUID(), category: name.trim(), document_types: [] },
    ],
  });
};

const renameCategory = (
  state: DokumenteDraftState,
  categoryIndex: number,
  name: string,
): DokumenteDraftState => {
  if (isBlankName(name)) {
    return refuse(state, { code: 'emptyCategoryName', categoryIndex });
  }

  const category = requireCategory(state.document, categoryIndex);
  return withDocument(
    state,
    replaceCategory(state.document, categoryIndex, {
      ...category,
      category: name.trim(),
    }),
  );
};

const addDocumentType = (
  state: DokumenteDraftState,
  categoryIndex: number,
  name: string,
): DokumenteDraftState => {
  if (isBlankName(name)) {
    return refuse(state, {
      code: 'emptyDocumentTypeName',
      categoryIndex,
      typeIndex: -1,
    });
  }

  const category = requireCategory(state.document, categoryIndex);
  const trimmed = name.trim();
  const duplicateIndex = findDuplicateDocumentTypeName(
    category.document_types.map((type) => type.name),
    trimmed,
    -1,
  );
  if (duplicateIndex >= 0) {
    return refuse(state, {
      code: 'duplicateDocumentTypeName',
      name: trimmed,
      categoryIndex,
      typeIndex: duplicateIndex,
    });
  }

  return withDocument(
    state,
    replaceCategory(state.document, categoryIndex, {
      ...category,
      document_types: [
        ...category.document_types,
        {
          id: crypto.randomUUID(),
          name: trimmed,
          description: '',
          expected_count: null,
        },
      ],
    }),
  );
};

/**
 * Patches one document type. Duplicate names inside the same category are
 * kept in the draft so the field can show the conflict, and lastRefusal is set.
 *
 * @param state Current dokumente draft.
 * @param categoryIndex Category that owns the type.
 * @param typeIndex Type being edited.
 * @param patch Name, description, and/or expected_count.
 * @returns Updated draft, possibly with a duplicate-name refusal.
 */
const updateDocumentType = (
  state: DokumenteDraftState,
  categoryIndex: number,
  typeIndex: number,
  patch: DocumentTypePatch,
): DokumenteDraftState => {
  const category = requireCategory(state.document, categoryIndex);
  const current = category.document_types[typeIndex];
  invariant(current !== undefined, 'Document type index is out of range');

  const nextName = patch.name === undefined ? current.name : patch.name;
  if (patch.name !== undefined && isBlankName(patch.name) === false) {
    const duplicateIndex = findDuplicateDocumentTypeName(
      category.document_types.map((type) => type.name),
      nextName,
      typeIndex,
    );
    if (duplicateIndex >= 0) {
      const nextTypes = category.document_types.map((type, index) =>
        index === typeIndex ? { ...type, ...patch, name: nextName } : type,
      );
      return {
        document: replaceCategory(state.document, categoryIndex, {
          ...category,
          document_types: nextTypes,
        }),
        lastRefusal: {
          code: 'duplicateDocumentTypeName',
          name: nextName.trim(),
          categoryIndex,
          typeIndex,
        },
      };
    }
  }

  return withDocument(
    state,
    replaceCategory(state.document, categoryIndex, {
      ...category,
      document_types: category.document_types.map((type, index) =>
        index === typeIndex ? { ...type, ...patch } : type,
      ),
    }),
  );
};

/**
 * Applies one category or document-type edit to the dokumente draft.
 *
 * @param state Current draft document and last refusal.
 * @param action Add/rename/remove category or document type, or replace.
 * @returns The next draft. Duplicate names refuse add without inserting.
 */
export const dokumenteDraftReducer = (
  state: DokumenteDraftState,
  action: DokumenteDraftAction,
): DokumenteDraftState => {
  switch (action.type) {
    case 'replace':
      return createDokumenteDraftState(action.document);
    case 'addCategory':
      return addCategory(state, action.name);
    case 'renameCategory':
      return renameCategory(state, action.categoryIndex, action.name);
    case 'removeCategory':
      return withDocument(state, {
        categories: state.document.categories.filter(
          (_, index) => index !== action.categoryIndex,
        ),
      });
    case 'addDocumentType':
      return addDocumentType(state, action.categoryIndex, action.name);
    case 'updateDocumentType':
      return updateDocumentType(
        state,
        action.categoryIndex,
        action.typeIndex,
        action.patch,
      );
    case 'removeDocumentType': {
      const category = requireCategory(state.document, action.categoryIndex);
      return withDocument(
        state,
        replaceCategory(state.document, action.categoryIndex, {
          ...category,
          document_types: category.document_types.filter(
            (_, index) => index !== action.typeIndex,
          ),
        }),
      );
    }
  }
};

export const isDokumenteDraftDirty = (
  draft: DokumenteDocument,
  server: DokumenteDocument,
): boolean => JSON.stringify(draft) !== JSON.stringify(server);
