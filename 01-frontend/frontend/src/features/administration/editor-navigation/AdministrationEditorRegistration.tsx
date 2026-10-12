import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

export type AdministrationEditor = {
  readonly dirty: boolean;
  readonly valid: boolean;
  readonly saving: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
};

export type AdministrationEditorState = {
  dirty: boolean;
  valid: boolean;
  saving: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
};

export type RegisterAdministrationEditor = (
  editor: AdministrationEditor,
) => () => void;

const AdministrationEditorRegistrationContext =
  createContext<RegisterAdministrationEditor | null>(null);

export const AdministrationEditorRegistrationProvider =
  AdministrationEditorRegistrationContext.Provider;

/**
 * Registers one stable controller for the mounted administration editor. Its
 * getters and actions always read the latest draft state, so the tab owner can
 * coordinate navigation without owning the individual editor models.
 */
export function useAdministrationEditorRegistration(
  state: AdministrationEditorState,
) {
  const registerEditor = useContext(AdministrationEditorRegistrationContext);
  const latestState = useRef(state);
  latestState.current = state;

  // eslint-disable-next-line no-restricted-syntax -- one stable controller is required for registration cleanup while its getters read current draft state
  const editor = useMemo<AdministrationEditor>(
    () => ({
      get dirty() {
        return latestState.current.dirty;
      },
      get valid() {
        return latestState.current.valid;
      },
      get saving() {
        return latestState.current.saving;
      },
      save: () => latestState.current.save(),
      discard: () => latestState.current.discard(),
    }),
    [],
  );

  // eslint-disable-next-line no-restricted-syntax -- registration follows the mounted editor lifecycle at the tab-owner integration boundary
  useEffect(() => registerEditor?.(editor), [editor, registerEditor]);
}
