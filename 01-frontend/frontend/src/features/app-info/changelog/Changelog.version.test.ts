import { describe, expect, it } from 'vitest';
import appVersion from './app-version.json';
import deChangelogMarkdown from './deChangelog.md?raw';
import enChangelogMarkdown from './enChangelog.md?raw';

type ReleaseHeading = {
  version: string;
  date: string;
};

const extractReleaseHeadings = (markdown: string): ReleaseHeading[] =>
  [
    ...markdown.matchAll(
      /^## Version (?<version>\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.]+)?) \((?<date>\d{2}\.\d{2}\.\d{4})\)$/gm,
    ),
  ].map(({ groups }) => ({
    version: groups?.version ?? '',
    date: groups?.date ?? '',
  }));

const releaseTimestamp = (releaseDate: string) => {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(releaseDate);
  if (match === null) {
    return Number.NaN;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);

  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? timestamp
    : Number.NaN;
};

const compareVersions = (left: string, right: string) => {
  const leftParts = left.replace(/-.*$/, '').split('.').map(Number);
  const rightParts = right.replace(/-.*$/, '').split('.').map(Number);

  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};

describe('Changelog version metadata', () => {
  it('keeps both release histories and the app version aligned', () => {
    const deReleases = extractReleaseHeadings(deChangelogMarkdown);
    const enReleases = extractReleaseHeadings(enChangelogMarkdown);
    const expectedVersion = appVersion.version.replace(/^v/, '');

    expect(appVersion.version).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(deReleases).toEqual(enReleases);
    expect(deReleases[0]?.version).toBe(expectedVersion);
    for (const [index, release] of deReleases.slice(1).entries()) {
      const previous = deReleases[index];
      const previousTimestamp = releaseTimestamp(previous?.date ?? '');
      const currentTimestamp = releaseTimestamp(release.date);

      expect(previousTimestamp).not.toBeNaN();
      expect(currentTimestamp).not.toBeNaN();
      expect(previousTimestamp).toBeGreaterThanOrEqual(currentTimestamp);
      expect(
        compareVersions(previous?.version ?? '', release.version),
      ).toBeGreaterThan(0);
    }
  });
});
