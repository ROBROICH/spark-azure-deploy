import { getRouteApi, useBlocker } from '@tanstack/react-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/features/ui/tabs/Tabs';

import type { AdministrationSection } from './administrationSections';
import { CatalogSection } from './catalog/CatalogSection';
import { DecisionTemplateSection } from './decision-template/DecisionTemplateSection';
import { DirtyEditorNavigationDialog } from './editor-navigation/DirtyEditorNavigationDialog';
import {
  AdministrationEditorRegistrationProvider,
  type AdministrationEditor,
  type RegisterAdministrationEditor,
} from './editor-navigation/AdministrationEditorRegistration';
import { CatalogExportButton } from './export/CatalogExportButton';
import { RequiredDocumentsSection } from './required-documents/RequiredDocumentsSection';

const administrationDetailRoute = getRouteApi('/administration/$projectTypeId');

export type AdministrationSectionsTabsProps = {
  projectTypeId: string;
};

/**
 * Exposes the active editor as route-backed tab state and coordinates dirty
 * draft decisions for tab changes, route leaves, refresh, and window close.
 */
export function AdministrationSectionsTabs(
  props: AdministrationSectionsTabsProps,
) {
  const { projectTypeId } = props;
  const { t } = useTranslation('Administration');
  const navigate = administrationDetailRoute.useNavigate();
  const section = administrationDetailRoute.useSearch({
    select: (search) => search.section,
  });
  const renderedSectionRef = useRef<AdministrationSection>(section);
  const requestedSectionRef = useRef<AdministrationSection>(section);
  if (renderedSectionRef.current !== section) {
    renderedSectionRef.current = section;
    requestedSectionRef.current = section;
  }
  const activeEditorRef = useRef<AdministrationEditor | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- ephemeral pending state for the dirty-navigation decision dialog
  const [isResolvingNavigation, setIsResolvingNavigation] = useState(false);

  // eslint-disable-next-line no-restricted-syntax -- stable provider registration prevents mounted drafts from unregistering on tab-owner rerenders
  const registerEditor = useCallback<RegisterAdministrationEditor>((editor) => {
    activeEditorRef.current = editor;

    return () => {
      if (activeEditorRef.current === editor) {
        activeEditorRef.current = null;
      }
    };
  }, []);
  // eslint-disable-next-line no-restricted-syntax -- useBlocker re-registers its history boundary when this callback identity changes
  const shouldBlockNavigation = useCallback(
    () => activeEditorRef.current?.dirty ?? false,
    [],
  );
  // eslint-disable-next-line no-restricted-syntax -- the browser history boundary requires a stable beforeunload predicate
  const enableBeforeUnload = useCallback(
    () => activeEditorRef.current?.dirty ?? false,
    [],
  );
  const blocker = useBlocker({
    shouldBlockFn: shouldBlockNavigation,
    enableBeforeUnload,
    withResolver: true,
  });

  const cancelNavigation = () => {
    if (blocker.status === 'blocked') {
      requestedSectionRef.current = section;
      blocker.reset();
    }
  };

  const discardAndSwitch = () => {
    if (blocker.status !== 'blocked') {
      return;
    }

    activeEditorRef.current?.discard();
    blocker.proceed();
  };

  const saveAndSwitch = async () => {
    if (blocker.status !== 'blocked') {
      return;
    }

    const editor = activeEditorRef.current;
    if (!editor || !editor.valid || editor.saving) {
      requestedSectionRef.current = section;
      blocker.reset();
      return;
    }

    setIsResolvingNavigation(true);
    let saved = false;
    try {
      saved = await editor.save();
    } catch {
      saved = false;
    }
    setIsResolvingNavigation(false);

    if (saved) {
      blocker.proceed();
      return;
    }

    requestedSectionRef.current = section;
    blocker.reset();
  };

  return (
    <AdministrationEditorRegistrationProvider value={registerEditor}>
      <Tabs
        value={section}
        onValueChange={(nextSection) => {
          const administrationSection = nextSection as AdministrationSection;
          if (requestedSectionRef.current === administrationSection) {
            return;
          }
          requestedSectionRef.current = administrationSection;
          void navigate({
            search: (previous) => ({
              ...previous,
              section: administrationSection,
            }),
            replace: true,
            resetScroll: false,
          }).catch(() => {
            requestedSectionRef.current = section;
          });
        }}
        className="gap-6"
      >
        <div className="flex items-center border-b border-border-primary">
          <TabsList className="min-w-0 flex-1 overflow-x-auto">
            <TabsTrigger value="catalog">{t('catalog.title')}</TabsTrigger>
            <TabsTrigger value="required-documents">
              {t('requiredDocuments.title')}
            </TabsTrigger>
            <TabsTrigger value="decision-template">
              {t('decisionTemplate.title')}
            </TabsTrigger>
          </TabsList>
          <CatalogExportButton projectTypeId={projectTypeId} />
        </div>

        <TabsContent value="catalog">
          <CatalogSection projectTypeId={projectTypeId} />
        </TabsContent>
        <TabsContent value="required-documents">
          <RequiredDocumentsSection projectTypeId={projectTypeId} />
        </TabsContent>
        <TabsContent value="decision-template">
          <DecisionTemplateSection projectTypeId={projectTypeId} />
        </TabsContent>
      </Tabs>

      <DirtyEditorNavigationDialog
        open={blocker.status === 'blocked'}
        isResolving={isResolvingNavigation}
        onSaveAndSwitch={() => {
          void saveAndSwitch();
        }}
        onDiscardAndSwitch={discardAndSwitch}
        onCancel={cancelNavigation}
      />
    </AdministrationEditorRegistrationProvider>
  );
}
