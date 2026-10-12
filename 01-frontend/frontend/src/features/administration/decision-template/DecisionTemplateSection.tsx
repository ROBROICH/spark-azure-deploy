import { useTranslation } from 'react-i18next';

import { CatalogQueryGate } from '../shared/CatalogQueryGate';
import { DecisionTemplateDraftSection } from './DecisionTemplateDraftSection';

export type DecisionTemplateSectionProps = {
  projectTypeId: string;
};

/**
 * Loads the catalog for the selected project type and shows the Beschluss
 * template editor when a usecase exists.
 *
 * @param props Selected project type id (also the usecase id).
 * @returns The decision-template region for that project type.
 */
export function DecisionTemplateSection(props: DecisionTemplateSectionProps) {
  const { projectTypeId } = props;
  const { t } = useTranslation('Administration');

  return (
    <CatalogQueryGate
      headingId="decision-template-heading"
      title={t('decisionTemplate.title')}
      projectTypeId={projectTypeId}
      missing={
        <p className="text-sm text-text-secondary">
          {t('decisionTemplate.missing')}
        </p>
      }
    >
      {(usecase) => (
        <DecisionTemplateDraftSection key={projectTypeId} usecase={usecase} />
      )}
    </CatalogQueryGate>
  );
}
