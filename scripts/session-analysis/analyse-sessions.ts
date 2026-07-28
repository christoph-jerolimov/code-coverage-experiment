#!/usr/bin/env tsx
/**
 * Analyse agentsview sessions in three layers:
 *
 *   1. Filter the base session set via `agentsview session list` (all default
 *      agentsview filters — project, machine, agent, date ranges, … — are
 *      forwarded verbatim).
 *   2. Run one or more detectors over the base set. Detectors with a prefilter
 *      first narrow candidates via `agentsview session search --regex`, then
 *      verify each candidate against its full tool calls and messages.
 *   3. Aggregate (counts + percentages) and list matching sessions with
 *      evidence for further investigation.
 *
 * Run `npm run analyse:sessions -- --help` for usage.
 */

import { AgentsviewClient } from './lib/agentsview.ts';
import { parseArgs, USAGE } from './lib/args.ts';
import { resolveDetectors } from './lib/detectors.ts';
import { buildReport, renderHumanReport } from './lib/report.ts';
import type { DetectorContext, DetectorResult, SessionContent, SessionSummary } from './lib/types.ts';

function main(argv: string[]): number {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    console.error();
    console.error(USAGE);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  const detectors = resolveDetectors(args.detectors);
  const ctx: DetectorContext = { skillName: args.skill, jiraProjectKeys: args.jiraProjects };
  const client = new AgentsviewClient({ bin: args.bin, commonArgs: args.commonArgs });

  // Layer 1: base session set.
  const baseSessions = client.listSessions(args.listArgs);
  if (baseSessions.length === 0) {
    console.error('No sessions matched the base filters.');
  }

  // Layer 2: detectors, with per-session content cached across detectors.
  const contentCache = new Map<string, SessionContent>();
  const getContent = (sessionId: string): SessionContent => {
    let content = contentCache.get(sessionId);
    if (!content) {
      content = client.getSessionContent(sessionId);
      contentCache.set(sessionId, content);
    }
    return content;
  };

  const results: DetectorResult[] = detectors.map((detector) => {
    let candidates: SessionSummary[] = baseSessions;
    const prefilter = args.noPrefilter ? null : detector.prefilter(ctx);
    if (prefilter !== null && baseSessions.length > 0) {
      try {
        const ids = client.searchSessionIds(prefilter);
        candidates = baseSessions.filter((session) => ids.has(session.id));
      } catch (error) {
        console.error(
          `warning: session search prefilter for ${detector.id} failed, deep-scanning all base sessions (${String(error)})`,
        );
      }
    }
    const matched = candidates
      .map((session) => ({ session, evidence: detector.matches(getContent(session.id), ctx) }))
      .filter((result) => result.evidence.length > 0);
    return { detector, matched };
  });

  // Layer 3: aggregate and print.
  if (args.idsOnly) {
    for (const { session } of results[0]!.matched) console.log(session.id);
    return 0;
  }
  const report = buildReport(args.listArgs, baseSessions, results);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderHumanReport(report));
  }
  return 0;
}

process.exit(main(process.argv.slice(2)));
