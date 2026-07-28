/**
 * Thin wrapper around the `agentsview` CLI.
 *
 * Every agentsview invocation in the analysis scripts goes through this module,
 * so if a subcommand or flag differs in your agentsview version there is
 * exactly one place to adjust. All commands are called with `--format json`.
 */

import { spawnSync } from 'node:child_process';

import {
  collectSessionIds,
  normalizeMessages,
  normalizeSessionList,
  normalizeToolCalls,
} from './normalize.ts';
import type { SessionContent, SessionSummary } from './types.ts';

export interface AgentsviewClientOptions {
  /** Path to the agentsview binary (default: "agentsview" on PATH). */
  bin: string;
  /** Flags forwarded to every invocation, e.g. --server, --server-token-file, --pg. */
  commonArgs: string[];
  /** Warning sink; defaults to stderr. Kept injectable for tests. */
  warn?: (message: string) => void;
}

export class AgentsviewClient {
  private readonly bin: string;
  private readonly commonArgs: string[];
  private readonly warn: (message: string) => void;
  private readonly warned = new Set<string>();

  constructor(options: AgentsviewClientOptions) {
    this.bin = options.bin;
    this.commonArgs = options.commonArgs;
    this.warn = options.warn ?? ((message) => console.error(message));
  }

  private runJson(args: string[]): unknown {
    const fullArgs = [...args, '--format', 'json', ...this.commonArgs];
    const result = spawnSync(this.bin, fullArgs, {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    if (result.error) {
      throw new Error(`Failed to run "${this.bin} ${fullArgs.join(' ')}": ${result.error.message}`);
    }
    if (result.status !== 0) {
      const stderr = (result.stderr ?? '').trim();
      throw new Error(
        `"${this.bin} ${fullArgs.join(' ')}" exited with status ${result.status}${stderr ? `:\n${stderr}` : ''}`,
      );
    }
    const stdout = (result.stdout ?? '').trim();
    if (!stdout) return null;
    try {
      return JSON.parse(stdout);
    } catch {
      throw new Error(
        `Could not parse JSON from "${this.bin} ${fullArgs.join(' ')}". First bytes: ${stdout.slice(0, 200)}`,
      );
    }
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warn(message);
  }

  /** Layer 1: `agentsview session list <filters>`. */
  listSessions(listArgs: string[]): SessionSummary[] {
    return normalizeSessionList(this.runJson(['session', 'list', ...listArgs]));
  }

  /** Candidate narrowing: `agentsview session search <pattern> --regex`. */
  searchSessionIds(pattern: string): Set<string> {
    return collectSessionIds(this.runJson(['session', 'search', pattern, '--regex']));
  }

  /** Deep scan input: tool calls + messages for one session. */
  getSessionContent(sessionId: string): SessionContent {
    let toolCalls: SessionContent['toolCalls'] = [];
    let messages: SessionContent['messages'] = [];
    try {
      toolCalls = normalizeToolCalls(this.runJson(['session', 'tool-calls', sessionId]));
    } catch (error) {
      this.warnOnce('tool-calls', `warning: "session tool-calls" failed, matching on messages only (${String(error)})`);
    }
    try {
      messages = normalizeMessages(this.runJson(['session', 'messages', sessionId]));
    } catch (error) {
      this.warnOnce('messages', `warning: "session messages" failed, matching on tool calls only (${String(error)})`);
    }
    return { toolCalls, messages };
  }
}
