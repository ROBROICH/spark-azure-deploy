import type { CompositeKey } from '@/db/nodes/compositeKey';
import { describe, expect, it } from 'vitest';
import type {
  EwmsBeteiligungsEingang,
  EwmsObjectionListItem,
} from './ewms.nodes';
import { matchesEwmsObjectionFilenameSearch } from './ewms.nodes';

const makeObjection = (params: {
  entryFilename?: string | null;
  fileId?: string;
  id?: string;
}): EwmsObjectionListItem => ({
  entry: {
    compositeKey:
      `beteiligungs_eingang:${params.id ?? 'entry-1'}` as CompositeKey,
    id: params.id ?? 'entry-1',
    nodeType: 'beteiligungs_eingang',
    beteiligungTyp: 'einwendung',
    fileId: params.fileId ?? 'file-1',
    filename: params.entryFilename ?? null,
    markdownId: null,
    extractionStatus: 'success',
    classificationStatus: 'done',
    projectId: 'project-1',
    isDeleted: false,
    isOutdated: false,
    frontendParentIds: [],
    projectVersion: 1,
    updateType: null,
    createdAt: '',
    updatedAt: '',
  } satisfies EwmsBeteiligungsEingang,
});

describe('matchesEwmsObjectionFilenameSearch', () => {
  it('matches filename values case-insensitively', () => {
    const objection = makeObjection({
      entryFilename: '/uploads/Stellungnahme-01.PDF',
    });

    expect(matchesEwmsObjectionFilenameSearch(objection, 'stellungnahme')).toBe(
      true,
    );
    expect(matchesEwmsObjectionFilenameSearch(objection, '  01.pdf  ')).toBe(
      true,
    );
  });

  it('does not match ids', () => {
    const objection = makeObjection({
      entryFilename: 'beteiligung.pdf',
      fileId: 'needle-file-id',
      id: 'needle-entry-id',
    });

    expect(matchesEwmsObjectionFilenameSearch(objection, 'needle')).toBe(false);
  });

  it('matches the entry filename when file ids also differ', () => {
    const objection = makeObjection({
      entryFilename: 'entry-name.pdf',
      fileId: 'document-name-file-id',
    });

    expect(matchesEwmsObjectionFilenameSearch(objection, 'entry-name')).toBe(
      true,
    );
    expect(matchesEwmsObjectionFilenameSearch(objection, 'document-name')).toBe(
      false,
    );
  });
});
