import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// @hey-api/client-fetch currently emits upstream TODO comments into generated clients.
const GENERATED_CLIENT_TODO_COMMENT =
  /^[ \t]*(?:(?:\/\/[ \t]*TODO\b.*)|(?:\/\*[ \t]*TODO\b.*\*\/))\r?\n?/gm;

const roots = process.argv.slice(2);

const findClientFiles = async (entryPath) => {
  const stats = await stat(entryPath);

  if (stats.isFile()) {
    return path.basename(entryPath) === 'client.gen.ts' ? [entryPath] : [];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  const entries = await readdir(entryPath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map((entry) => findClientFiles(path.join(entryPath, entry.name))),
  );

  return nestedFiles.flat();
};

let updatedFiles = 0;

for (const root of roots.length > 0 ? roots : ['src/api-clients']) {
  const clientFiles = await findClientFiles(root);

  for (const filePath of clientFiles) {
    const content = await readFile(filePath, 'utf8');
    const nextContent = content.replace(GENERATED_CLIENT_TODO_COMMENT, '');

    if (nextContent !== content) {
      await writeFile(filePath, nextContent);
      updatedFiles += 1;
    }
  }
}

if (updatedFiles > 0) {
  console.log(
    `Removed uppercase TODO comments from ${updatedFiles} generated client file(s).`,
  );
}
