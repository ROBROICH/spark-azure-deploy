/** W3C/WCAG 2.1 input purpose tokens for applicant (Antragsteller) fields. */
export const APPLICANT_FIELD_AUTOCOMPLETE = {
  firstName: 'given-name',
  lastName: 'family-name',
  company: 'organization',
  street: 'address-line1',
  houseNumber: 'address-line2',
  addressSupplement: 'address-line3',
  plz: 'postal-code',
  location: 'address-level2',
  country: 'country-name',
  email: 'email',
  phone: 'tel',
} as const;

export type ApplicantAutocompleteField =
  keyof typeof APPLICANT_FIELD_AUTOCOMPLETE;
