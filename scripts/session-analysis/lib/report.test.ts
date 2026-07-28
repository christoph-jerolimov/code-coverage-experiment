import { describe, expect, it } from 'vitest';

import { prCreatedDetector } from './detectors.ts';
import { buildReport, percentage, renderHumanReport } from './report.ts';
import type { SessionSummary } from './types.ts';

function session(id: string, extra: Partial<SessionSummary> = {}): SessionSummary {
  return { id, raw: {}, ...extra };
}

describe('percentage', () => {
  it('rounds to one decimal and handles an empty base set', () => {
    expect(percentage(1, 3)).toBe(33.3);
    expect(percentage(0, 0)).toBe(0);
  });
});

describe('buildReport / renderHumanReport', () => {
  it('aggregates counts, percentages and session details', () => {
    const base = [session('a', { project: 'rhdh' }), session('b'), session('c'), session('d')];
    const report = buildReport(
      ['--project', 'rhdh'],
      base,
      [
        {
          detector: prCreatedDetector,
          matched: [{ session: base[0]!, evidence: ['Bash → github.com/org/repo/pull/1'] }],
        },
      ],
    );

    expect(report.total_sessions).toBe(4);
    expect(report.detectors[0]).toMatchObject({ id: 'pr-created', matched: 1, percentage: 25 });
    expect(report.detectors[0]!.sessions[0]).toMatchObject({ id: 'a', project: 'rhdh' });

    const rendered = renderHumanReport(report);
    expect(rendered).toContain('Base filters: --project rhdh');
    expect(rendered).toContain('matched 1/4 sessions (25%)');
    expect(rendered).toContain('github.com/org/repo/pull/1');
  });
});
