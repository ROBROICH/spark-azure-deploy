import type { CreateProjectRequest } from '@/api-clients/pls-module/types.gen';
import { germanStateByCode } from '@/features/project/data/project-details-form/federalStates';
import { isDuplicateInternalProjectNumber } from '@/features/project/data/project-details-form/projectForm.logic';
import type {
  ApplicantStepValues,
  ProjectStepValues,
} from '@/features/project/data/project-details-form/projectForm.schema';
import type { Step } from './formReducer';

export { isDuplicateInternalProjectNumber };

function getLocalCreatedById(): string | undefined {
  if (!import.meta.env.DEV) {
    return undefined;
  }

  const localUserId = import.meta.env.VITE_LOCAL_USER_ID?.trim();
  return localUserId || undefined;
}

/**
 * Builds the project creation payload while keeping creator identity
 * server-derived outside local development.
 */
export function buildCreateProjectBody(
  step1: ProjectStepValues,
  step2: ApplicantStepValues,
): CreateProjectRequest {
  // Local dev has no Envoy/Keycloak session, so project creation falls back to
  // VITE_LOCAL_USER_ID. Production still lets the backend derive the creator.
  const createdById = getLocalCreatedById();

  return {
    name: step1.name.trim(),
    projectTypeId: step1.projectTypeId.trim(),
    ...(createdById ? { createdById } : {}),
    entryDate: step1.entryDate.trim(),
    internalProjectNumber: step1.internalProjectNumber.trim(),
    state: step1.federalState ? germanStateByCode[step1.federalState] : null,
    company: step2.company.trim() || null,
    firstName: step2.firstName.trim() || null,
    lastName: step2.lastName.trim() || null,
    street: step2.street.trim() || null,
    houseNumber: step2.houseNumber.trim() || null,
    addressSupplement: step2.addressSupplement.trim() || null,
    plz: step2.plz.trim() || null,
    location: step2.location.trim() || null,
    country: step2.country.trim() || null,
    email: step2.email.trim() || null,
    phone: step2.phone.trim() || null,
  };
}

export const nextButtonLabelByStep: Record<Step, string> = {
  1: 'next',
  2: 'createProject',
};
