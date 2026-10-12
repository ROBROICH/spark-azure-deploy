import type { ProjectResponse } from '@/api-clients/backend';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useProject } from '@/features/project/data/collections/projects.collection';
import { getDateLocale } from '@/i18n/dateLocale';
import { formatDate } from '@/i18n/formatDate';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import {
  OverviewDetailsCard,
  OverviewDetailsCardSkeleton,
} from '../OverviewDetailsCard';
import { ImportedProjectBadge } from './ImportedProjectBadge';
import { ProjectDetailsEditForm } from './ProjectDetailsEditForm';

const route = getRouteApi('/verfahren/$verfahrenId/');

type OverviewDetailRows = ComponentProps<typeof OverviewDetailsCard>['rows'];
type ProjectDetailsProject = Pick<
  ProjectResponse,
  | 'name'
  | 'projectTypeName'
  | 'internalProjectNumber'
  | 'state'
  | 'entryDate'
  | 'originalCreatedAt'
  | 'imported'
>;
type Translate = ReturnType<typeof useTranslation<'Project'>>['t'];

type CreatedAtValueProps = {
  originalCreatedAt?: string | null;
  dateLocale: string;
  notSpecified: string;
  isImported: boolean;
};

function valueOrFallback(
  value: string | null | undefined,
  fallback: string,
): string {
  return value || fallback;
}

function formatOptionalDate(
  value: string | null | undefined,
  dateLocale: string,
  notSpecified: string,
): string {
  if (!value) {
    return notSpecified;
  }

  return formatDate(value, dateLocale);
}

function formatFederalState(
  project: ProjectDetailsProject,
  t: Translate,
  notSpecified: string,
): string {
  if (!project.state) {
    return notSpecified;
  }

  return t(`ProjectDetails.federalStates.${project.state}`);
}

function CreatedAtValue(props: CreatedAtValueProps) {
  const { originalCreatedAt, dateLocale, notSpecified, isImported } = props;

  return (
    <span className="inline-flex items-center gap-2">
      <span>
        {formatOptionalDate(originalCreatedAt, dateLocale, notSpecified)}
      </span>
      {isImported ? <ImportedProjectBadge /> : null}
    </span>
  );
}

function buildProjectRows(
  project: ProjectDetailsProject,
  t: Translate,
  dateLocale: string,
  notSpecified: string,
): OverviewDetailRows {
  return [
    {
      key: 'projectName',
      label: t('ProjectDetails.projectName'),
      value: valueOrFallback(project.name, notSpecified),
      valueClassName: '[overflow-wrap:anywhere]',
    },
    {
      key: 'art',
      label: t('ProjectDetails.art'),
      value: valueOrFallback(project.projectTypeName, notSpecified),
    },
    {
      key: 'aktenzeichen',
      label: t('ProjectDetails.aktenzeichen'),
      value: project.internalProjectNumber,
    },
    {
      key: 'federalState',
      label: t('ProjectDetails.federalState'),
      value: formatFederalState(project, t, notSpecified),
    },
    {
      key: 'entryDate',
      label: t('ProjectDetails.entryDate'),
      value: formatOptionalDate(project.entryDate, dateLocale, notSpecified),
    },
    {
      key: 'createdAt',
      label: t('ProjectDetails.createdAt'),
      hasBottomBorder: false,
      value: (
        <CreatedAtValue
          originalCreatedAt={project.originalCreatedAt}
          dateLocale={dateLocale}
          notSpecified={notSpecified}
          isImported={project.imported === true}
        />
      ),
    },
  ];
}

/**
 * Card component displaying project details with inline edit support.
 * Shows project name, type, status, reference number, contact person, and creation date.
 */
export const ProjectDetailsCard = () => {
  const { verfahrenId } = route.useParams();
  const { data: project, isLoading } = useProject(verfahrenId);
  const { canMutateProject } = useCanMutateProject({
    requiredLevel: 'user',
  });
  const { t, i18n } = useTranslation('Project');
  const dateLocale = getDateLocale(i18n.language);
  const notSpecified = t('common.notSpecified');
  // eslint-disable-next-line no-restricted-syntax -- ephemeral UI toggle for inline edit mode
  const [isEditing, setIsEditing] = useState(false);

  if (isLoading || !project) {
    return <OverviewDetailsCardSkeleton rowCount={6} />;
  }

  return (
    <OverviewDetailsCard
      title={t('ProjectDetails.title')}
      editAriaLabel={t('ProjectDetails.editAriaLabel')}
      canEdit={canMutateProject}
      isEditing={isEditing}
      onEdit={() => setIsEditing(true)}
      rows={buildProjectRows(project, t, dateLocale, notSpecified)}
    >
      <ProjectDetailsEditForm
        canMutateProject={canMutateProject}
        project={project}
        onCancel={() => setIsEditing(false)}
        onSaved={() => setIsEditing(false)}
      />
    </OverviewDetailsCard>
  );
};
