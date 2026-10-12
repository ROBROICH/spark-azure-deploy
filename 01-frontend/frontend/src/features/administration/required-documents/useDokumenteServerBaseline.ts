import type { Usecase } from '../data/usecaseApi';
import { useDraftServerBaseline } from '../editor-navigation/useDraftServerBaseline';
import {
  isDokumenteDraftDirty,
  type DokumenteDraftAction,
  type DokumenteDraftState,
} from './dokumenteDraft';

export const useDokumenteBaseline = (
  usecase: Usecase,
  draft: DokumenteDraftState['document'],
  dispatch: (action: DokumenteDraftAction) => void,
) =>
  useDraftServerBaseline({
    serverSnapshot: usecase,
    serverBaseline: usecase.dokumente,
    draft,
    isDirty: isDokumenteDraftDirty,
    replaceDraft: (document) => {
      dispatch({ type: 'replace', document });
    },
  });
