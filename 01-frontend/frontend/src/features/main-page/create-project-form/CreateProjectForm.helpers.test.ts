import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ApplicantStepValues,
  ProjectStepValues,
} from '@/features/project/data/project-details-form/projectForm.schema';
import {
  buildCreateProjectBody,
  isDuplicateInternalProjectNumber,
} from './CreateProjectForm.helpers';

const step1: ProjectStepValues = {
  name: '  Test project  ',
  projectTypeId: 'type-1',
  federalState: 'BY',
  entryDate: '2024-01-15',
  internalProjectNumber: 'AZ-001',
};

const step2: ApplicantStepValues = {
  company: 'Acme',
  firstName: 'Erika',
  lastName: 'Mustermann',
  street: 'Hauptstraße',
  houseNumber: '1',
  addressSupplement: '',
  plz: '12345',
  location: 'Berlin',
  country: 'Deutschland',
  email: 'erika@example.com',
  phone: '',
};

describe('buildCreateProjectBody', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses VITE_LOCAL_USER_ID as createdById in development builds', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv(
      'VITE_LOCAL_USER_ID',
      '  ad2fd27f-1a53-4cb2-b646-7ef2ca2596f0  ',
    );

    const body = buildCreateProjectBody(step1, step2);

    expect(body.createdById).toBe('ad2fd27f-1a53-4cb2-b646-7ef2ca2596f0');
  });

  it('omits createdById in development builds when VITE_LOCAL_USER_ID is blank', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_LOCAL_USER_ID', '   ');

    const body = buildCreateProjectBody(step1, step2);

    expect('createdById' in body).toBe(false);
    expect(body.createdById).toBeUndefined();
  });

  it('omits createdById in development builds when VITE_LOCAL_USER_ID is unset', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_LOCAL_USER_ID', undefined);

    const body = buildCreateProjectBody(step1, step2);

    expect('createdById' in body).toBe(false);
    expect(body.createdById).toBeUndefined();
  });

  it('omits createdById in production builds even when VITE_LOCAL_USER_ID is set', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_LOCAL_USER_ID', 'ad2fd27f-1a53-4cb2-b646-7ef2ca2596f0');

    const body = buildCreateProjectBody(step1, step2);

    expect('createdById' in body).toBe(false);
    expect(body.createdById).toBeUndefined();
  });

  it('trims and maps the submitted project fields', () => {
    const body = buildCreateProjectBody(step1, step2);

    expect(body.name).toBe('Test project');
    expect(body.projectTypeId).toBe('type-1');
    expect(body.entryDate).toBe('2024-01-15');
    expect(body.internalProjectNumber).toBe('AZ-001');
    expect(body.state).toBe('Bayern');
    expect(body.email).toBe('erika@example.com');
  });

  it('maps blank optional applicant fields to null', () => {
    const body = buildCreateProjectBody(step1, {
      ...step2,
      company: '   ',
      phone: '',
    });

    expect(body.company).toBeNull();
    expect(body.phone).toBeNull();
  });
});

describe('isDuplicateInternalProjectNumber', () => {
  it('matches case-insensitively after trimming', () => {
    expect(isDuplicateInternalProjectNumber(['AZ-001'], '  az-001 ')).toBe(
      true,
    );
  });

  it('treats a blank candidate as non-duplicate', () => {
    expect(isDuplicateInternalProjectNumber(['AZ-001'], '   ')).toBe(false);
  });
});
