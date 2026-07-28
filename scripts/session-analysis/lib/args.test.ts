import { describe, expect, it } from 'vitest';

import { parseArgs } from './args.ts';

describe('parseArgs', () => {
  it('forwards agentsview session list filters verbatim', () => {
    const args = parseArgs(['--project', 'rhdh', '--machine', 'laptop', '--date-from', '2026-07-01', '--include-children']);
    expect(args.listArgs).toEqual(['--project', 'rhdh', '--machine', 'laptop', '--date-from', '2026-07-01', '--include-children']);
  });

  it('separates connection flags for every agentsview call', () => {
    const args = parseArgs(['--server', 'http://localhost:8080', '--pg']);
    expect(args.commonArgs).toEqual(['--server', 'http://localhost:8080', '--pg']);
    expect(args.listArgs).toEqual([]);
  });

  it('collects repeatable detector and jira-project flags', () => {
    const args = parseArgs(['--detect', 'pr-created', '--detect', 'jira-reference', '--jira-project', 'rhdh']);
    expect(args.detectors).toEqual(['pr-created', 'jira-reference']);
    expect(args.jiraProjects).toEqual(['RHDH']);
  });

  it('has sensible defaults', () => {
    const args = parseArgs([]);
    expect(args.skill).toBe('rhdh-jira');
    expect(args.detectors).toEqual([]);
    expect(args.json).toBe(false);
    expect(args.noPrefilter).toBe(false);
  });

  it('supports the --list-arg escape hatch', () => {
    const args = parseArgs(['--list-arg', '--future-flag']);
    expect(args.listArgs).toEqual(['--future-flag']);
  });

  it('rejects unknown flags', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown flag "--nope"/);
  });

  it('rejects value flags without a value', () => {
    expect(() => parseArgs(['--project'])).toThrow(/requires a value/);
  });

  it('requires exactly one detector for --ids output', () => {
    expect(() => parseArgs(['--ids'])).toThrow(/--ids requires exactly one/);
    expect(() => parseArgs(['--ids', '--detect', 'pr-created', '--detect', 'jira-reference'])).toThrow(
      /--ids requires exactly one/,
    );
    expect(parseArgs(['--ids', '--detect', 'pr-created']).idsOnly).toBe(true);
  });
});
