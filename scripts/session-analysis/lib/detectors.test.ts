import { describe, expect, it } from 'vitest';

import {
  ALL_DETECTORS,
  githubIssueReferenceDetector,
  githubPrReferenceDetector,
  jiraFieldChangeDetector,
  jiraReferenceDetector,
  prCreatedDetector,
  resolveDetectors,
  skillUsageDetector,
} from './detectors.ts';
import type { DetectorContext, SessionContent, SessionMessage, ToolCall } from './types.ts';

const ctx: DetectorContext = { skillName: 'rhdh-jira', jiraProjectKeys: [] };

function message(text: string, role = 'user'): SessionMessage {
  return { role, text, raw: {} };
}

function toolCall(toolName: string, input: string, output = ''): ToolCall {
  return { toolName, input, output, raw: {} };
}

function content(overrides: Partial<SessionContent> = {}): SessionContent {
  return { toolCalls: [], messages: [], ...overrides };
}

describe('skillUsageDetector', () => {
  it('matches a Skill tool call with the configured skill name', () => {
    const session = content({ toolCalls: [toolCall('Skill', '{"skill":"rhdh-jira","args":""}')] });
    expect(skillUsageDetector.matches(session, ctx)).toHaveLength(1);
  });

  it('matches a slash-command invocation in a user message', () => {
    const session = content({ messages: [message('please run /rhdh-jira for RHDH-1')] });
    expect(skillUsageDetector.matches(session, ctx)).toHaveLength(1);
  });

  it('matches a <command-name> transcript marker', () => {
    const session = content({ messages: [message('<command-name>/rhdh-jira</command-name>')] });
    expect(skillUsageDetector.matches(session, ctx)).toHaveLength(1);
  });

  it('respects the configured skill name', () => {
    const session = content({ toolCalls: [toolCall('Skill', '{"skill":"other-skill"}')] });
    expect(skillUsageDetector.matches(session, ctx)).toHaveLength(0);
    expect(skillUsageDetector.matches(session, { ...ctx, skillName: 'other-skill' })).toHaveLength(1);
  });
});

describe('jiraReferenceDetector', () => {
  it('finds ticket keys in messages and tool calls', () => {
    const session = content({
      messages: [message('Look at RHDH-1234 please')],
      toolCalls: [toolCall('Bash', 'curl https://issues.redhat.com/browse/RHIDP-42')],
    });
    expect(jiraReferenceDetector.matches(session, ctx)).toEqual(['RHDH-1234', 'RHIDP-42']);
  });

  it('ignores stoplisted technical tokens like UTF-8 and SHA-256', () => {
    const session = content({ messages: [message('encode as UTF-8, hash with SHA-256, per RFC-3339')] });
    expect(jiraReferenceDetector.matches(session, ctx)).toHaveLength(0);
  });

  it('restricts matching to configured project keys', () => {
    const session = content({ messages: [message('RHDH-1 and OTHER-2')] });
    const scoped = { ...ctx, jiraProjectKeys: ['RHDH'] };
    expect(jiraReferenceDetector.matches(session, scoped)).toEqual(['RHDH-1']);
  });

  it('deduplicates repeated ticket keys', () => {
    const session = content({ messages: [message('RHDH-1 RHDH-1 RHDH-1')] });
    expect(jiraReferenceDetector.matches(session, ctx)).toEqual(['RHDH-1']);
  });
});

describe('jiraFieldChangeDetector', () => {
  it('matches mutating Jira MCP tool names', () => {
    const session = content({ toolCalls: [toolCall('mcp__jira__update_issue', '{"key":"RHDH-1","status":"Done"}')] });
    expect(jiraFieldChangeDetector.matches(session, ctx)).toHaveLength(1);
  });

  it('matches jira CLI mutations run via Bash', () => {
    const session = content({ toolCalls: [toolCall('Bash', 'jira issue move RHDH-1 "In Progress"')] });
    expect(jiraFieldChangeDetector.matches(session, ctx)).toHaveLength(1);
  });

  it('matches mutating REST calls', () => {
    const session = content({
      toolCalls: [toolCall('Bash', 'curl -X POST https://issues.redhat.com/rest/api/2/issue/RHDH-1/transitions -d ...')],
    });
    expect(jiraFieldChangeDetector.matches(session, ctx)).toHaveLength(1);
  });

  it('does not match read-only Jira usage', () => {
    const session = content({
      toolCalls: [
        toolCall('mcp__jira__get_issue', '{"key":"RHDH-1"}'),
        toolCall('Bash', 'jira issue view RHDH-1'),
      ],
    });
    expect(jiraFieldChangeDetector.matches(session, ctx)).toHaveLength(0);
  });
});

describe('githubIssueReferenceDetector', () => {
  it('matches issue URLs in messages', () => {
    const session = content({ messages: [message('see https://github.com/org/repo/issues/12')] });
    expect(githubIssueReferenceDetector.matches(session, ctx)).toEqual(['github.com/org/repo/issues/12']);
  });

  it('matches gh issue CLI calls and GitHub MCP issue tools', () => {
    const session = content({
      toolCalls: [
        toolCall('Bash', 'gh issue view 12 --json title'),
        toolCall('mcp__github__issue_read', '{"issue_number":12}'),
      ],
    });
    expect(githubIssueReferenceDetector.matches(session, ctx)).toHaveLength(2);
  });

  it('does not match PR URLs', () => {
    const session = content({ messages: [message('https://github.com/org/repo/pull/12')] });
    expect(githubIssueReferenceDetector.matches(session, ctx)).toHaveLength(0);
  });
});

describe('githubPrReferenceDetector', () => {
  it('matches PR URLs, gh pr CLI calls and MCP pull request tools', () => {
    const session = content({
      messages: [message('review https://github.com/org/repo/pull/7')],
      toolCalls: [
        toolCall('Bash', 'gh pr checkout 7'),
        toolCall('mcp__github__pull_request_read', '{"pullNumber":7}'),
      ],
    });
    expect(githubPrReferenceDetector.matches(session, ctx)).toHaveLength(3);
  });

  it('does not match issue URLs', () => {
    const session = content({ messages: [message('https://github.com/org/repo/issues/7')] });
    expect(githubPrReferenceDetector.matches(session, ctx)).toHaveLength(0);
  });
});

describe('prCreatedDetector', () => {
  it('matches gh pr create and includes the created PR URL from the output', () => {
    const session = content({
      toolCalls: [
        toolCall('Bash', 'gh pr create --title "Fix" --body "..."', 'https://github.com/org/repo/pull/99\n'),
      ],
    });
    expect(prCreatedDetector.matches(session, ctx)).toEqual(['Bash → github.com/org/repo/pull/99']);
  });

  it('matches the GitHub MCP create_pull_request tool', () => {
    const session = content({ toolCalls: [toolCall('mcp__github__create_pull_request', '{"title":"Fix"}')] });
    expect(prCreatedDetector.matches(session, ctx)).toHaveLength(1);
  });

  it('does not match PR reads', () => {
    const session = content({ toolCalls: [toolCall('Bash', 'gh pr view 99')] });
    expect(prCreatedDetector.matches(session, ctx)).toHaveLength(0);
  });
});

describe('resolveDetectors', () => {
  it('returns all detectors by default', () => {
    expect(resolveDetectors([])).toEqual(ALL_DETECTORS);
  });

  it('resolves detectors by id and keeps the requested order', () => {
    const detectors = resolveDetectors(['pr-created', 'jira-reference']);
    expect(detectors.map((d) => d.id)).toEqual(['pr-created', 'jira-reference']);
  });

  it('throws on unknown detector ids', () => {
    expect(() => resolveDetectors(['nope'])).toThrow(/Unknown detector "nope"/);
  });
});
