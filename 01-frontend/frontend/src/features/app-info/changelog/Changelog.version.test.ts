import { describe, expect, it } from 'vitest';
import appVersion from './app-version.json';
import deChangelogMarkdown from './deChangelog.md?raw';
import enChangelogMarkdown from './enChangelog.md?raw';

const extractLatestVersion = (markdown: string) => {
  const match = /^## Version (?<version>\d+\.\d+(?:\.\d+)?)/m.exec(markdown);

  return match?.groups?.version;
};

describe('Changelog version metadata', () => {
  it('keeps the app version aligned with the latest German and English changelog entries', () => {
    const expectedVersion = appVersion.version.replace(/^v/, '');

    expect(extractLatestVersion(deChangelogMarkdown)).toBe(expectedVersion);
    expect(extractLatestVersion(enChangelogMarkdown)).toBe(expectedVersion);
  });
});
