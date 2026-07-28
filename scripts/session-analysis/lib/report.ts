/**
 * Layer 3: aggregate detector results and render them for humans or machines.
 */

import type { DetectorResult, SessionSummary } from './types.ts';

export interface Report {
  schema_version: 1;
  base_filters: string[];
  total_sessions: number;
  detectors: Array<{
    id: string;
    description: string;
    matched: number;
    percentage: number;
    sessions: Array<{
      id: string;
      agent?: string;
      project?: string;
      machine?: string;
      git_branch?: string;
      started_at?: string;
      evidence: string[];
    }>;
  }>;
}

export function percentage(matched: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((matched / total) * 1000) / 10;
}

export function buildReport(
  baseFilters: string[],
  baseSessions: SessionSummary[],
  results: DetectorResult[],
): Report {
  return {
    schema_version: 1,
    base_filters: baseFilters,
    total_sessions: baseSessions.length,
    detectors: results.map((result) => ({
      id: result.detector.id,
      description: result.detector.description,
      matched: result.matched.length,
      percentage: percentage(result.matched.length, baseSessions.length),
      sessions: result.matched.map(({ session, evidence }) => ({
        id: session.id,
        agent: session.agent,
        project: session.project,
        machine: session.machine,
        git_branch: session.gitBranch,
        started_at: session.startedAt,
        evidence,
      })),
    })),
  };
}

export function renderHumanReport(report: Report): string {
  const lines: string[] = [];
  const filters = report.base_filters.length > 0 ? report.base_filters.join(' ') : '(none)';
  lines.push(`Base filters: ${filters}`);
  lines.push(`Base sessions: ${report.total_sessions}`);
  lines.push('');

  for (const detector of report.detectors) {
    lines.push(
      `${detector.id} — ${detector.description}`,
    );
    lines.push(
      `  matched ${detector.matched}/${report.total_sessions} sessions (${detector.percentage}%)`,
    );
    for (const session of detector.sessions) {
      const meta = [session.project, session.machine, session.started_at]
        .filter(Boolean)
        .join('  ');
      lines.push(`    ${session.id}${meta ? `  [${meta}]` : ''}`);
      for (const evidence of session.evidence.slice(0, 3)) {
        lines.push(`      · ${evidence}`);
      }
      if (session.evidence.length > 3) {
        lines.push(`      · … ${session.evidence.length - 3} more evidence entries (use --json)`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}
