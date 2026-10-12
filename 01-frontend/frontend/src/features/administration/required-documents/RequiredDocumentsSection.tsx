import { useTranslation } from 'react-i18next';

import { CatalogQueryGate } from '../shared/CatalogQueryGate';
import { RequiredDocumentsDraftSection } from './RequiredDocumentsDraftSection';

export type RequiredDocumentsSectionProps = {
  projectTypeId: string;
};

/**
 * Loads the catalog for the selected project type and shows the required
 * documents editor when a usecase exists.
 *
 * @param props Selected project type id (also the usecase id).
 * @returns The required-documents region for that project type.
 */
export function RequiredDocumentsSection(props: RequiredDocumentsSectionProps) {
  const { projectTypeId } = props;
  const { t } = useTranslation('Administration');

  return (
    <CatalogQueryGate
      headingId="required-documents-heading"
      title={t('requiredDocuments.title')}
      projectTypeId={projectTypeId}
      missing={
        <p className="text-sm text-text-secondary">
          {t('requiredDocuments.missing')}
        </p>
      }
    >
      {(usecase) => (
        <RequiredDocumentsDraftSection key={projectTypeId} usecase={usecase} />
      )}
    </CatalogQueryGate>
  );
}
