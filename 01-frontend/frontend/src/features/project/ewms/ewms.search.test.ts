import { describe, expect, it } from 'vitest';
import {
  ewmsDocumentViewerTabSearchSchema,
  ewmsMainTabSearchSchema,
  ewmsSearchSchema,
  isEwmsTab,
} from './ewms.search';

describe('isEwmsTab', () => {
  it('returns true for valid tab values', () => {
    expect(isEwmsTab('sender')).toBe(true);
    expect(isEwmsTab('topics')).toBe(true);
  });

  it('returns false for invalid values', () => {
    expect(isEwmsTab('unknown')).toBe(false);
    expect(isEwmsTab('')).toBe(false);
  });
});

describe('ewmsMainTabSearchSchema', () => {
  it('parses a valid tab value', () => {
    expect(ewmsMainTabSearchSchema.parse({ tab: 'topics' })).toEqual({
      tab: 'topics',
    });
  });

  it('defaults to the first value when key is missing', () => {
    expect(ewmsMainTabSearchSchema.parse({})).toEqual({ tab: 'sender' });
  });

  it('falls back to the first value for an invalid member', () => {
    expect(ewmsMainTabSearchSchema.parse({ tab: 'invalid' })).toEqual({
      tab: 'sender',
    });
  });
});

describe('ewmsDocumentViewerTabSearchSchema', () => {
  it('parses a valid document viewer tab value', () => {
    expect(
      ewmsDocumentViewerTabSearchSchema.parse({
        documentViewerTab: 'originalFile',
      }),
    ).toEqual({ documentViewerTab: 'originalFile' });
  });

  it('defaults to the first value when key is missing', () => {
    expect(ewmsDocumentViewerTabSearchSchema.parse({})).toEqual({
      documentViewerTab: 'extractedText',
    });
  });
});

describe('ewmsSearchSchema', () => {
  it('applies defaults for all optional swimlane keys', () => {
    const result = ewmsSearchSchema.parse({});

    expect(result.objectionsFilter).toBeUndefined();
    expect(result.objectionsSearch).toBeUndefined();
    expect(result.objectionsSort).toBe('nameAsc');
    expect(result.tab).toBe('sender');
    expect(result.documentViewerTab).toBe('extractedText');
  });

  it('parses a full search object', () => {
    const result = ewmsSearchSchema.parse({
      tab: 'topics',
      documentViewerTab: 'originalFile',
      objectionsFilter: ['einwendung'],
      objectionsSearch: '  einwendung-1.pdf  ',
      objectionsSort: 'createdAtDesc',
      selectedObjectionId: '123',
    });

    expect(result).toEqual({
      tab: 'topics',
      documentViewerTab: 'originalFile',
      objectionsFilter: ['einwendung'],
      objectionsSearch: 'einwendung-1.pdf',
      objectionsSort: 'createdAtDesc',
      selectedObjectionId: '123',
    });
  });

  it('treats blank Beteiligungseingang search values as unset', () => {
    const result = ewmsSearchSchema.parse({
      objectionsSearch: '   ',
    });

    expect(result.objectionsSearch).toBeUndefined();
  });

  it('parses multiple Beteiligung types in the filter array', () => {
    const result = ewmsSearchSchema.parse({
      objectionsFilter: ['stellungnahme', 'naturschutz'],
    });

    expect(result.objectionsFilter).toEqual(['stellungnahme', 'naturschutz']);
  });

  it('falls back for invalid Beteiligungseingang sort values', () => {
    const result = ewmsSearchSchema.parse({
      objectionsSort: 'invalid',
    });

    expect(result.objectionsSort).toBe('nameAsc');
  });
});
