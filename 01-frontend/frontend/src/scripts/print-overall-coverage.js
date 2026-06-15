import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const coveragePath = path.resolve(__dirname, '../../coverage/coverage-summary.json');

if (!fs.existsSync(coveragePath)) {
  console.error('Could not find coverage-summary.json');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
const total = data.total;

let totalCovered = 0;
let totalStatements = 0;

for (const key of ['statements', 'branches', 'functions', 'lines']) {
  const covered = total[key]?.covered ?? 0;
  const statements = total[key]?.total ?? 0;

  totalCovered += covered;
  totalStatements += statements;
}

const percent =
  totalStatements > 0 ? (totalCovered / totalStatements) * 100 : 0;

console.log(
  '='.repeat(25),
  '[Unit Test Coverage Summary]',
  '='.repeat(25),
);

console.log(`✔ Covered Items: ${totalCovered}`);
console.log(`✔ Total Items: ${totalStatements}`);
console.log(`✔ Coverage Percent: ${percent.toFixed(2)}%`);

console.log('='.repeat(80) + '\n');
