import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(frontendRoot, '../..');
const clientsRoot = resolve(frontendRoot, 'src/api-clients');
const srcRoot = resolve(frontendRoot, 'src');
const identSuffixes = [
  'Data',
  'Error',
  'Errors',
  'Response',
  'Responses',
  'Options',
  'Mutation',
  'QueryKey',
] as const;

const urlExport =
  /export const (\w+) = .*?\.(get|post|put|patch|delete)<[^>]+>\(\{.*?url: '([^']+)'/gs;
const capitalize = (name: string) =>
  `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

const parseSdk = (source: string) => {
  const byUrl = new Map<string, string>();
  for (const match of source.matchAll(urlExport)) {
    const name = match[1];
    const method = match[2];
    const url = match[3];
    if (!name || !method || !url) {
      continue;
    }
    byUrl.set(`${method} ${url.replace(/\{[^}]+\}/g, '{}')}`, name);
  }
  return byUrl;
};

const remaps = new Map<string, string>();

const addGeneratedIdents = (from: string, to: string) => {
  remaps.set(from, to);
  remaps.set(capitalize(from), capitalize(to));
  for (const suffix of identSuffixes) {
    remaps.set(`${capitalize(from)}${suffix}`, `${capitalize(to)}${suffix}`);
    remaps.set(`${from}${suffix}`, `${to}${suffix}`);
  }
};

const recordUrlRemap = (from: string, to: string | undefined) => {
  if (!to || to === from) {
    return;
  }
  addGeneratedIdents(from, to);
};

for (const moduleName of readdirSync(clientsRoot)) {
  const sdkPath = `01-frontend/frontend/src/api-clients/${moduleName}/sdk.gen.ts`;
  const shown = spawnSync('git', ['show', `HEAD:${sdkPath}`], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (shown.status !== 0) {
    continue;
  }
  const next = parseSdk(readFileSync(resolve(repoRoot, sdkPath), 'utf8'));
  for (const [url, from] of parseSdk(shown.stdout)) {
    recordUrlRemap(from, next.get(url));
  }
}

const ordered = [...remaps.keys()].sort(
  (left, right) => right.length - left.length,
);
const pattern = new RegExp(
  `\\b(?:${ordered.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'g',
);

const isSkippedDirectory = (name: string, path: string) =>
  name === 'node_modules' || path === clientsRoot;

const isTypeScriptFile = (name: string) =>
  name.endsWith('.ts') || name.endsWith('.tsx');

const collectTypeScriptFiles = (root: string) => {
  const out: string[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.pop() ?? srcRoot;
    const entries = readdirSync(dir, { withFileTypes: true }).map((entry) => ({
      entry,
      path: resolve(dir, entry.name),
    }));
    pending.push(
      ...entries
        .filter(
          ({ entry, path }) =>
            entry.isDirectory() && !isSkippedDirectory(entry.name, path),
        )
        .map(({ path }) => path),
    );
    out.push(
      ...entries
        .filter(({ entry }) => entry.isFile() && isTypeScriptFile(entry.name))
        .map(({ path }) => path),
    );
  }
  return out;
};

const targets = collectTypeScriptFiles(srcRoot);

let changedFiles = 0;
let replacements = 0;
for (const file of targets) {
  const source = readFileSync(file, 'utf8');
  const next = source.replace(pattern, (match) => {
    const mapped = remaps.get(match);
    if (mapped) {
      replacements += 1;
    }
    return mapped ?? match;
  });
  if (next !== source) {
    writeFileSync(file, next);
    changedFiles += 1;
  }
}

process.stdout.write(
  `rewrote ${replacements} identifiers in ${changedFiles} files (${remaps.size} rename pairs)\n`,
);
