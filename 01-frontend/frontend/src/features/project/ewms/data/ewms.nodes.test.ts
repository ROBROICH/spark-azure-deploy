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
    node_type: 'beteiligungs_eingang',
    beteiligung_typ: 'einwendung',
    file_id: params.fileId ?? 'file-1',
    filename: params.entryFilename ?? null,
    beteiligungs_eingang_markdown_id: null,
    extraction_status: 'success',
    classification_status: 'done',
    project_id: 'project-1',
    is_deleted: false,
    is_outdated: false,
    frontend_parent_ids: [],
    project_version: 1,
    update_type: null,
    created_at: '',
    updated_at: '',
    sys_period: null,
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
