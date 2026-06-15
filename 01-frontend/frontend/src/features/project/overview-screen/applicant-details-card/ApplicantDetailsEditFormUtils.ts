import { type ProjectResponse } from '@/api-clients/pls-module';
import { type EditApplicantValues } from '@/features/project/overview-screen/schemas';

type ApplicantDetailsProject = Pick<
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

export function buildApplicantDefaultValues(
  project: ApplicantDetailsProject,
): EditApplicantValues {
  return {
    company: project.company || '',
    firstName: project.firstName || '',
    lastName: project.lastName || '',
    street: project.street || '',
    houseNumber: project.houseNumber || '',
    addressSupplement: project.addressSupplement || '',
    plz: project.plz || '',
    location: project.location || '',
    country: project.country || 'Deutschland',
    email: project.email || '',
    phone: project.phone || '',
  };
}

export function buildApplicantPatchBody(value: EditApplicantValues) {
  return {
    company: value.company.trim() || null,
    firstName: value.firstName.trim() || null,
    lastName: value.lastName.trim() || null,
    street: value.street.trim() || null,
    houseNumber: value.houseNumber.trim() || null,
    addressSupplement: value.addressSupplement.trim() || null,
    plz: value.plz.trim() || null,
    location: value.location.trim() || null,
    country: value.country.trim() || null,
    email: value.email.trim() || null,
    phone: value.phone.trim() || null,
  };
}
