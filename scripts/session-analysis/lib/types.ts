/**
 * Shared types for the session analysis scripts.
 *
 * All data is read through the `agentsview` CLI — the raw JSON shapes are not
 * fully specified, so every record keeps a `raw` reference and the normalized
 * fields are best-effort (see normalize.ts).
 */

export interface SessionSummary {
  id: string;
  agent?: string;
  project?: string;
  machine?: string;
  gitBranch?: string;
  startedAt?: string;
  raw: Record<string, unknown>;
}

export interface ToolCall {
  toolName: string;
  /** Stringified tool input, used for pattern matching. */
  input: string;
  /** Stringified tool output/result, when available. */
  output: string;
  raw: Record<string, unknown>;
}

export interface SessionMessage {
  role: string;
  text: string;
  raw: Record<string, unknown>;
}

/** Full (normalized) content of a single session. */
export interface SessionContent {
  toolCalls: ToolCall[];
  messages: SessionMessage[];
}

/** Tunables shared by all detectors. */
export interface DetectorContext {
  /** Skill name for the skill-usage detector, e.g. "rhdh-jira". */
  skillName: string;
  /** Optional Jira project keys (e.g. ["RHDH", "RHIDP"]) to make the Jira detectors precise. */
  jiraProjectKeys: string[];
}

export interface Detector {
  id: string;
  description: string;
  /**
   * Optional regex passed to `agentsview session search --regex` to cheaply
   * narrow the candidate set before deep-scanning session content.
   * Return null to always deep-scan every base session.
   */
  prefilter(ctx: DetectorContext): string | null;
  /** Returns evidence strings; an empty array means "no match". */
  matches(content: SessionContent, ctx: DetectorContext): string[];
}

export interface DetectorSessionResult {
  session: SessionSummary;
  evidence: string[];
}

export interface DetectorResult {
  detector: Detector;
  matched: DetectorSessionResult[];
}
