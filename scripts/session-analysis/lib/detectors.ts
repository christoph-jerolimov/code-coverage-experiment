/**
 * Layer-2 detectors: each one answers a single "how many and which sessions…"
 * question over normalized session content.
 *
 * Detectors are pure functions over SessionContent so they can be unit tested
 * without the agentsview CLI. Each detector may also provide a prefilter regex
 * for `agentsview session search --regex` to narrow candidates cheaply before
 * the per-session deep scan.
 */

import { allTexts } from './normalize.ts';
import type { Detector, DetectorContext, SessionContent } from './types.ts';

const MAX_EVIDENCE = 10;

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function capEvidence(values: string[]): string[] {
  const deduped = unique(values);
  if (deduped.length <= MAX_EVIDENCE) return deduped;
  return [...deduped.slice(0, MAX_EVIDENCE), `… +${deduped.length - MAX_EVIDENCE} more`];
}

function snippet(text: string, maxLength = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= maxLength ? flat : `${flat.slice(0, maxLength)}…`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchAll(texts: string[], pattern: RegExp): string[] {
  const found: string[] = [];
  for (const text of texts) {
    for (const match of text.matchAll(pattern)) found.push(match[0]);
  }
  return found;
}

/** Uppercase prefixes that look like Jira keys but almost never are. */
const JIRA_KEY_STOPLIST = new Set([
  'UTF', 'ISO', 'RFC', 'SHA', 'MD', 'AES', 'RSA', 'TLS', 'SSL',
  'GMT', 'UTC', 'CVE', 'HTTP', 'IPV', 'OAUTH',
]);

function jiraKeyPattern(ctx: DetectorContext): RegExp {
  if (ctx.jiraProjectKeys.length > 0) {
    const keys = ctx.jiraProjectKeys.map(escapeRegex).join('|');
    return new RegExp(`\\b(?:${keys})-\\d{1,6}\\b`, 'g');
  }
  return /\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/g;
}

function findJiraKeys(texts: string[], ctx: DetectorContext): string[] {
  const keys = matchAll(texts, jiraKeyPattern(ctx));
  if (ctx.jiraProjectKeys.length > 0) return keys;
  return keys.filter((key) => !JIRA_KEY_STOPLIST.has(key.slice(0, key.indexOf('-'))));
}

export const skillUsageDetector: Detector = {
  id: 'skill-usage',
  description: 'Sessions that invoked the configured skill (see --skill)',
  prefilter: (ctx) => escapeRegex(ctx.skillName),
  matches: (content, ctx) => {
    const evidence: string[] = [];
    const skill = ctx.skillName;
    for (const toolCall of content.toolCalls) {
      if (/skill/i.test(toolCall.toolName) && toolCall.input.includes(skill)) {
        evidence.push(`${toolCall.toolName}: ${snippet(toolCall.input)}`);
      }
    }
    const slashInvocation = new RegExp(`(^|\\s)/${escapeRegex(skill)}\\b`, 'm');
    const commandMarker = new RegExp(`<command-name>\\s*/?${escapeRegex(skill)}\\b`);
    for (const message of content.messages) {
      if (slashInvocation.test(message.text) || commandMarker.test(message.text)) {
        evidence.push(`${message.role} message: ${snippet(message.text)}`);
      }
    }
    return capEvidence(evidence);
  },
};

export const jiraReferenceDetector: Detector = {
  id: 'jira-reference',
  description: 'Sessions that reference a Jira ticket (KEY-123, browse URLs, …)',
  prefilter: (ctx) =>
    ctx.jiraProjectKeys.length > 0
      ? `(${ctx.jiraProjectKeys.map(escapeRegex).join('|')})-[0-9]+`
      : '[A-Z][A-Z0-9]+-[0-9]+',
  matches: (content, ctx) => capEvidence(findJiraKeys(allTexts(content), ctx).sort()),
};

const JIRA_MUTATION_VERBS = /(update|edit|transition|assign|move|resolve|close|set[-_]?status|set[-_]?field|add[-_]?label)/i;

export const jiraFieldChangeDetector: Detector = {
  id: 'jira-field-change',
  description: 'Sessions that changed a Jira status or another field (via Jira tools, CLI or REST)',
  prefilter: () => 'jira',
  matches: (content) => {
    const evidence: string[] = [];
    for (const toolCall of content.toolCalls) {
      // MCP-style Jira tools whose name itself is a mutation, e.g. mcp__jira__update_issue.
      if (/jira/i.test(toolCall.toolName) && JIRA_MUTATION_VERBS.test(toolCall.toolName)) {
        evidence.push(`${toolCall.toolName}: ${snippet(toolCall.input)}`);
        continue;
      }
      // Jira CLI invocations, e.g. `jira issue move RHDH-123 "In Progress"`.
      if (/\bjira\b[^\n]{0,120}\b(edit|move|transition|assign|resolve|close)\b/i.test(toolCall.input)) {
        evidence.push(`${toolCall.toolName}: ${snippet(toolCall.input)}`);
        continue;
      }
      // Direct REST calls that mutate issues, e.g. curl -X PUT .../rest/api/2/issue/RHDH-1.
      if (
        /rest\/api\/[^\s"']*\/(issue|transitions)/i.test(toolCall.input) &&
        /\b(PUT|POST)\b/.test(toolCall.input)
      ) {
        evidence.push(`${toolCall.toolName}: ${snippet(toolCall.input)}`);
      }
    }
    return capEvidence(evidence);
  },
};

const GITHUB_ISSUE_URL = /github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+/g;
const GITHUB_PR_URL = /github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g;

export const githubIssueReferenceDetector: Detector = {
  id: 'github-issue-reference',
  description: 'Sessions that reference a GitHub issue (URLs, gh CLI, GitHub MCP tools)',
  prefilter: () => 'github\\.com/[^/]+/[^/]+/issues/[0-9]+|gh issue ',
  matches: (content) => {
    const evidence = matchAll(allTexts(content), GITHUB_ISSUE_URL);
    for (const toolCall of content.toolCalls) {
      if (/\bgh issue\b/.test(toolCall.input)) {
        evidence.push(`${toolCall.toolName}: ${snippet(toolCall.input)}`);
      } else if (/github/i.test(toolCall.toolName) && /issue/i.test(toolCall.toolName)) {
        evidence.push(`${toolCall.toolName}: ${snippet(toolCall.input)}`);
      }
    }
    return capEvidence(evidence);
  },
};

export const githubPrReferenceDetector: Detector = {
  id: 'github-pr-reference',
  description: 'Sessions that reference a GitHub pull request (URLs, gh CLI, GitHub MCP tools)',
  prefilter: () => 'github\\.com/[^/]+/[^/]+/pull/[0-9]+|gh pr ',
  matches: (content) => {
    const evidence = matchAll(allTexts(content), GITHUB_PR_URL);
    for (const toolCall of content.toolCalls) {
      if (/\bgh pr\b/.test(toolCall.input)) {
        evidence.push(`${toolCall.toolName}: ${snippet(toolCall.input)}`);
      } else if (/github/i.test(toolCall.toolName) && /(pull_request|_pr_|^pr_)/i.test(toolCall.toolName)) {
        evidence.push(`${toolCall.toolName}: ${snippet(toolCall.input)}`);
      }
    }
    return capEvidence(evidence);
  },
};

export const prCreatedDetector: Detector = {
  id: 'pr-created',
  description: 'Sessions that created a pull request (gh pr create or a create_pull_request tool)',
  prefilter: () => 'gh pr create|create_pull_request',
  matches: (content) => {
    const evidence: string[] = [];
    for (const toolCall of content.toolCalls) {
      const created =
        /\bgh pr create\b/.test(toolCall.input) || /create_pull_request/i.test(toolCall.toolName);
      if (!created) continue;
      const urls = unique([...toolCall.output.matchAll(GITHUB_PR_URL)].map((m) => m[0]));
      evidence.push(
        urls.length > 0
          ? `${toolCall.toolName} → ${urls.join(', ')}`
          : `${toolCall.toolName}: ${snippet(toolCall.input)}`,
      );
    }
    return capEvidence(evidence);
  },
};

export const ALL_DETECTORS: Detector[] = [
  skillUsageDetector,
  jiraReferenceDetector,
  jiraFieldChangeDetector,
  githubIssueReferenceDetector,
  githubPrReferenceDetector,
  prCreatedDetector,
];

export function resolveDetectors(ids: string[]): Detector[] {
  if (ids.length === 0) return ALL_DETECTORS;
  return ids.map((id) => {
    const detector = ALL_DETECTORS.find((d) => d.id === id);
    if (!detector) {
      const known = ALL_DETECTORS.map((d) => d.id).join(', ');
      throw new Error(`Unknown detector "${id}". Known detectors: ${known}`);
    }
    return detector;
  });
}

/** Convenience wrapper used by tests. */
export function runDetector(detector: Detector, content: SessionContent, ctx: DetectorContext): string[] {
  return detector.matches(content, ctx);
}
