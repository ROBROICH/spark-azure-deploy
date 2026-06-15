import type { ProjectResponse } from '@/api-clients/pls-module';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useProject } from '@/features/project/data/collections/projects.collection';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';

import {
  OverviewDetailsCard,
  OverviewDetailsCardSkeleton,
} from '../OverviewDetailsCard';
import { ApplicantDetailsEditForm } from './ApplicantDetailsEditForm';

const route = getRouteApi('/verfahren/$verfahrenId');

type OverviewDetailRows = ComponentProps<typeof OverviewDetailsCard>['rows'];
type ApplicantProject = Pick<
  ProjectResponse,
  | 'company'
  | 'firstName'
  | 'lastName'
  | 'street'
  | 'houseNumber'
  | 'addressSupplement'
  | 'plz'
  | 'location'
  | 'country'
  | 'email'
  | 'phone'
>;
type Translate = ReturnType<typeof useTranslation<'Project'>>['t'];

function valueOrFallback(
  value: string | null | undefined,
  fallback: string,
): string {
  return value || fallback;
}

function formatApplicantName(project: ApplicantProject): string {
  return [project.firstName, project.lastName].filter(Boolean).join(' ');
}

function formatAddressLine(
  primary: string | null | undefined,
  secondary: string | null | undefined,
): string | undefined {
  if (!primary) {
    return undefined;
  }

  return `${primary} ${secondary ?? ''}`.trim();
}

function formatApplicantAddress(
  project: ApplicantProject,
  notSpecified: string,
): string {
  const address = [
    formatAddressLine(project.street, project.houseNumber),
    formatAddressLine(project.plz, project.location),
    project.addressSupplement,
  ]
    .filter(Boolean)
    .join(', ');

  return valueOrFallback(address, notSpecified);
}

function buildApplicantRows(
  project: ApplicantProject,
  t: Translate,
  notSpecified: string,
): OverviewDetailRows {
  return [
    {
      key: 'company',
      label: t('ApplicantDetails.company'),
      value: valueOrFallback(project.company, notSpecified),
    },
    {
      key: 'fullName',
      label: t('ApplicantDetails.fullName'),
      value: formatApplicantName(project) || notSpecified,
    },
    {
      key: 'address',
      label: t('ApplicantDetails.address'),
      value: formatApplicantAddress(project, notSpecified),
    },
    {
      key: 'country',
      label: t('ApplicantDetails.country'),
      value: valueOrFallback(project.country, notSpecified),
    },
    {
      key: 'email',
      label: t('ApplicantDetails.email'),
      labelTone: 'secondary',
      value: valueOrFallback(project.email, notSpecified),
    },
    {
      key: 'phone',
      label: t('ApplicantDetails.phone'),
      labelTone: 'secondary',
      value: valueOrFallback(project.phone, notSpecified),
    },
  ];
}

/** Displays applicant information with inline edit support via pencil button. */
export const ApplicantDetailsCard = () => {
  const { verfahrenId } = route.useParams();
  const { data: project, isLoading } = useProject(verfahrenId);
  const { canMutateProject } = useCanMutateProject({
    requiredLevel: 'user',
  });
  const { t } = useTranslation('Project');
  const notSpecified = t('common.notSpecified');
  // eslint-disable-next-line no-restricted-syntax -- ephemeral UI toggle for inline edit mode
  const [isEditing, setIsEditing] = useState(false);

  if (isLoading || !project) {
    return <OverviewDetailsCardSkeleton rowCount={7} />;
  }

  return (
    <OverviewDetailsCard
      title={t('ApplicantDetails.title')}
      editAriaLabel={t('ApplicantDetails.editAriaLabel')}
      canEdit={canMutateProject}
      isEditing={isEditing}
      onEdit={() => setIsEditing(true)}
      rows={buildApplicantRows(project, t, notSpecified)}
    >
      <ApplicantDetailsEditForm
        canMutateProject={canMutateProject}
        project={project}
        onCancel={() => setIsEditing(false)}
        onSaved={() => setIsEditing(false)}
      />
    </OverviewDetailsCard>
  );
};
