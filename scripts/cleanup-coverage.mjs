// Removes stale coverage reports from a gh-pages checkout:
//   - coverage/pr/<number>       for PRs merged or closed more than MAX_AGE_DAYS ago
//   - coverage/branches/<name>   for branches (except main) whose last push is
//                                older than MAX_AGE_DAYS, or that no longer exist
//
// Expects to run from a checkout of the repository (with all remote branches
// fetched, e.g. actions/checkout with fetch-depth: 0) so branch ages can be
// read from git. The gh-pages checkout location is passed via GH_PAGES_DIR.
//
// Environment: GITHUB_REPOSITORY (owner/repo), GITHUB_TOKEN, GH_PAGES_DIR

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

const MAX_AGE_DAYS = 30;
const PROTECTED_BRANCHES = ['main'];

const pagesDir = process.env.GH_PAGES_DIR ?? 'gh-pages';
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!repo || !token) {
  console.error('GITHUB_REPOSITORY and GITHUB_TOKEN must be set.');
  process.exit(1);
}

const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
let removedCount = 0;

function remove(dir, reason) {
  console.log(`Removing ${dir} (${reason})`);
  rmSync(dir, { recursive: true, force: true });
  removedCount += 1;
}

// --- PR reports: coverage/pr/<number> ---------------------------------------

async function fetchPullRequest(number) {
  const response = await fetch(`https://api.github.com/repos/${repo}/pulls/${number}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'coverage-cleanup',
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub API request for PR #${number} failed: ${response.status}`);
  }
  return response.json();
}

const prRoot = join(pagesDir, 'coverage', 'pr');
if (existsSync(prRoot)) {
  for (const entry of readdirSync(prRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
    const dir = join(prRoot, entry.name);
    const pr = await fetchPullRequest(entry.name);
    if (pr === null) {
      remove(dir, 'PR not found');
    } else if (pr.state === 'closed' && pr.closed_at && Date.parse(pr.closed_at) < cutoff) {
      const kind = pr.merged_at ? 'merged' : 'closed';
      remove(dir, `PR ${kind} on ${pr.closed_at}`);
    } else {
      console.log(`Keeping ${dir} (PR is ${pr.state})`);
    }
  }
}

// --- Branch reports: coverage/branches/<name> --------------------------------

// Last-commit timestamps (ms) for every remote branch, keyed by branch name.
const branchDates = new Map();
const refs = execFileSync(
  'git',
  ['for-each-ref', '--format=%(refname)|%(committerdate:unix)', 'refs/remotes/origin'],
  { encoding: 'utf8' }
);
for (const line of refs.split('\n').filter(Boolean)) {
  const [refname, timestamp] = line.split('|');
  const branch = refname.replace('refs/remotes/origin/', '');
  branchDates.set(branch, Number(timestamp) * 1000);
}

// Branch names may contain slashes, so a report root is identified by its
// index.html rather than by directory depth (lcov-report also has an
// index.html, but we stop descending at the first report root above it).
function findReportRoots(dir) {
  if (existsSync(join(dir, 'index.html'))) return [dir];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => findReportRoots(join(dir, entry.name)));
}

const branchesRoot = join(pagesDir, 'coverage', 'branches');
if (existsSync(branchesRoot)) {
  for (const dir of findReportRoots(branchesRoot)) {
    const branch = relative(branchesRoot, dir);
    if (PROTECTED_BRANCHES.includes(branch)) {
      console.log(`Keeping ${dir} (protected branch)`);
      continue;
    }
    const lastPush = branchDates.get(branch);
    if (lastPush === undefined) {
      remove(dir, 'branch no longer exists');
    } else if (lastPush < cutoff) {
      remove(dir, `last push on ${new Date(lastPush).toISOString()}`);
    } else {
      console.log(`Keeping ${dir} (last push on ${new Date(lastPush).toISOString()})`);
    }
  }
}

console.log(removedCount > 0 ? `Removed ${removedCount} stale report(s).` : 'Nothing to remove.');
