// Renders a markdown coverage report for the GitHub Actions job summary.
// Reads coverage/coverage-summary.json (totals and per-file percentages)
// and coverage/lcov.info (per-line hit counts, used for uncovered lines).
//
// Usage: node scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';

const THRESHOLD = 80;
const METRICS = ['statements', 'branches', 'functions', 'lines'];

const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const lcov = readFileSync('coverage/lcov.info', 'utf8');

const status = (pct) => (pct >= THRESHOLD ? '✅' : '❌');
const cell = (metric) => `${metric.pct}% (${metric.covered}/${metric.total})`;

// lcov.info: SF:<file> starts a record, DA:<line>,<hits> is per-line data.
const uncoveredByFile = new Map();
let currentFile = null;
for (const line of lcov.split('\n')) {
  if (line.startsWith('SF:')) {
    currentFile = line.slice(3).trim();
  } else if (line.startsWith('DA:') && currentFile) {
    const [lineNo, hits] = line.slice(3).split(',').map(Number);
    if (hits === 0) {
      if (!uncoveredByFile.has(currentFile)) uncoveredByFile.set(currentFile, []);
      uncoveredByFile.get(currentFile).push(lineNo);
    }
  }
}

// Compress a sorted list of line numbers into ranges: [1,2,3,7] -> "1–3, 7"
function toRanges(lines) {
  const sorted = [...lines].sort((a, b) => a - b);
  const ranges = [];
  for (const n of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && n === last[1] + 1) {
      last[1] = n;
    } else {
      ranges.push([n, n]);
    }
  }
  return ranges.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
}

const out = [];

const total = summary.total;
const allPassed = METRICS.every((m) => total[m].pct >= THRESHOLD);
out.push(`## Coverage ${allPassed ? '✅' : '❌'}`);
out.push('');
out.push('| Metric | Coverage | Status |');
out.push('| --- | --- | --- |');
for (const m of METRICS) {
  out.push(`| ${m} | ${cell(total[m])} | ${status(total[m].pct)} |`);
}
out.push('');
out.push(`Threshold: ${THRESHOLD}% for all metrics.`);
out.push('');

out.push('### Files');
out.push('');
out.push('| File | Statements | Branches | Functions | Lines | Uncovered lines |');
out.push('| --- | --- | --- | --- | --- | --- |');
const files = Object.keys(summary)
  .filter((key) => key !== 'total')
  .sort();
for (const file of files) {
  const rel = relative(process.cwd(), file);
  const f = summary[file];
  const uncovered = uncoveredByFile.get(file) ?? uncoveredByFile.get(rel) ?? [];
  const worst = Math.min(...METRICS.map((m) => f[m].pct));
  out.push(
    `| ${status(worst)} \`${rel}\` | ${cell(f.statements)} | ${cell(f.branches)} | ${cell(f.functions)} | ${cell(f.lines)} | ${uncovered.length > 0 ? toRanges(uncovered) : '—'} |`
  );
}

console.log(out.join('\n'));
