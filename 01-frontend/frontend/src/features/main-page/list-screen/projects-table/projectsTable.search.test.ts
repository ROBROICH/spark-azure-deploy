import { describe, expect, it } from 'vitest';
import { projectsTableSearchSchema } from './projectsTable.search';

describe('projectsTableSearchSchema', () => {
  describe('anlageFilter', () => {
    it('parses valid enum members', () => {
      expect(
        projectsTableSearchSchema.parse({
          anlageFilter: ['spark', 'fpp'],
        }),
      ).toMatchObject({ anlageFilter: ['spark', 'fpp'] });
    });

    it('falls back to empty array for invalid member', () => {
      expect(
        projectsTableSearchSchema.parse({ anlageFilter: ['invalid'] }),
      ).toMatchObject({ anlageFilter: [] });
    });

    it('defaults to undefined when key is missing', () => {
      const result = projectsTableSearchSchema.parse({});
      expect(result.anlageFilter).toBeUndefined();
    });
  });

  describe('zuordnungFilter', () => {
    it('parses a valid value', () => {
      expect(
        projectsTableSearchSchema.parse({ zuordnungFilter: 'meine' }),
      ).toMatchObject({
        zuordnungFilter: 'meine',
      });
    });

    it('defaults to undefined when key is missing', () => {
      const result = projectsTableSearchSchema.parse({});
      expect(result.zuordnungFilter).toBeUndefined();
    });

    it('falls back to "alle" for an invalid value', () => {
      expect(
        projectsTableSearchSchema.parse({ zuordnungFilter: 'invalid' }),
      ).toMatchObject({ zuordnungFilter: 'alle' });
    });

    it('parses "alle" as-is', () => {
      expect(
        projectsTableSearchSchema.parse({ zuordnungFilter: 'alle' }),
      ).toMatchObject({ zuordnungFilter: 'alle' });
    });
  });

  describe('favoriteFilter', () => {
    it('parses valid enum members', () => {
      expect(
        projectsTableSearchSchema.parse({
          favoriteFilter: ['favorited', 'not-favorited'],
        }),
      ).toMatchObject({ favoriteFilter: ['favorited', 'not-favorited'] });
    });

    it('falls back to empty array for invalid member', () => {
      expect(
        projectsTableSearchSchema.parse({ favoriteFilter: ['invalid'] }),
      ).toMatchObject({ favoriteFilter: [] });
    });

    it('defaults to undefined when key is missing', () => {
      const result = projectsTableSearchSchema.parse({});
      expect(result.favoriteFilter).toBeUndefined();
    });
  });

  describe('search', () => {
    it('falls back to empty string for a non-string value', () => {
      expect(projectsTableSearchSchema.parse({ search: 123 })).toMatchObject({
        search: '',
      });
    });

    it('is undefined when key is missing', () => {
      const result = projectsTableSearchSchema.parse({});
      expect(result.search).toBeUndefined();
    });
  });
});
