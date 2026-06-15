# Project Maintenance Couplings

Use when a change touches repo-specific files whose correctness depends on another nearby file.

## Rules

- When `src/features/app-info/changelog/deChangelog.md` or `src/features/app-info/changelog/enChangelog.md` changes, inspect the paired changelog file and `src/features/app-info/changelog/app-version.json` in the same change.
- Keep both changelog files aligned on the newest version heading, release order, and release date.
- Keep `app-version.json` aligned with the newest changelog heading, using the existing `vX.Y.Z` value format.
- In review, flag changelog updates that do not update the paired language file and app version to the same release.
- Keep this file for small repo-specific couplings only. If a coupling grows into a domain policy, move it to that domain rule folder.

## Report When

Report a changelog version heading that diverges from `app-version.json`, a German/English changelog version mismatch, or a release-note edit that forgot the paired language file or version file.

## Human Triage Suggestion

Suggest updating the paired changelog file and `app-version.json` to the newest changelog version, or explicitly deferring the version bump with release-owner confirmation.
