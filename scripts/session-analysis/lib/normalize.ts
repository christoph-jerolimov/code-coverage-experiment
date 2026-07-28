/**
 * Defensive normalization of agentsview CLI JSON output.
 *
 * The exact JSON shapes of `session list`, `session search`, `session
 * tool-calls` and `session messages` are not pinned by a published schema, so
 * everything here accepts several plausible field spellings (snake_case and
 * camelCase) and container shapes (a bare array, or an object wrapping the
 * array under a well-known key). If agentsview changes its output, this file
 * is the only place that needs adjusting.
 */

import type { SessionContent, SessionMessage, SessionSummary, ToolCall } from './types.ts';

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

/** Find the payload array in `parsed`: either the root array or the first array under one of `keys`. */
export function findArray(parsed: unknown, keys: string[]): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  const record = asRecord(parsed);
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

/** Render an arbitrary JSON value as searchable text (content-block arrays are flattened). */
export function toText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join('\n');
  const record = asRecord(value);
  if (record) {
    if (typeof record['text'] === 'string') return record['text'];
    try {
      return JSON.stringify(record);
    } catch {
      return '';
    }
  }
  return '';
}

export function normalizeSessionSummary(rawItem: unknown): SessionSummary | null {
  const record = asRecord(rawItem);
  if (!record) return null;
  const id = pickString(record, ['id', 'session_id', 'sessionId']);
  if (!id) return null;
  return {
    id,
    agent: pickString(record, ['agent', 'agent_name', 'agentName']),
    project: pickString(record, ['project', 'project_label', 'projectLabel', 'project_name']),
    machine: pickString(record, ['machine', 'machine_name', 'machineName', 'host', 'hostname']),
    gitBranch: pickString(record, ['git_branch', 'gitBranch', 'branch']),
    startedAt: pickString(record, ['started_at', 'startedAt', 'start_time', 'created_at', 'timestamp']),
    raw: record,
  };
}

export function normalizeSessionList(parsed: unknown): SessionSummary[] {
  const items = findArray(parsed, ['sessions', 'items', 'data', 'results', 'rows']);
  return items.map(normalizeSessionSummary).filter((s): s is SessionSummary => s !== null);
}

export function normalizeToolCalls(parsed: unknown): ToolCall[] {
  const items = findArray(parsed, ['tool_calls', 'toolCalls', 'calls', 'items', 'data', 'results', 'rows']);
  const toolCalls: ToolCall[] = [];
  for (const item of items) {
    const record = asRecord(item);
    if (!record) continue;
    const toolName = pickString(record, ['tool_name', 'toolName', 'name', 'tool']) ?? '';
    const input = toText(
      record['input'] ?? record['tool_input'] ?? record['arguments'] ?? record['args'] ?? record['parameters'],
    );
    const output = toText(
      record['output'] ?? record['result'] ?? record['tool_output'] ?? record['response'],
    );
    if (!toolName && !input && !output) continue;
    toolCalls.push({ toolName, input, output, raw: record });
  }
  return toolCalls;
}

export function normalizeMessages(parsed: unknown): SessionMessage[] {
  const items = findArray(parsed, ['messages', 'items', 'data', 'results', 'rows']);
  const messages: SessionMessage[] = [];
  for (const item of items) {
    const record = asRecord(item);
    if (!record) continue;
    const role = pickString(record, ['role', 'type', 'sender', 'author']) ?? 'unknown';
    const text = toText(record['text'] ?? record['content'] ?? record['body'] ?? record['message']);
    if (!text) continue;
    messages.push({ role, text, raw: record });
  }
  return messages;
}

/**
 * Collect anything that looks like a session id from a search result payload.
 * Over-collection is harmless: callers intersect the result with the layer-1
 * base session set, so unrelated ids simply never match.
 */
export function collectSessionIds(parsed: unknown): Set<string> {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const record = asRecord(value);
    if (!record) return;
    for (const key of ['session_id', 'sessionId', 'id']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.length > 0) ids.add(candidate);
    }
    for (const nested of Object.values(record)) {
      if (typeof nested === 'object' && nested !== null) visit(nested);
    }
  };
  visit(parsed);
  return ids;
}

/** Combine every text surface of a session (messages, tool inputs and outputs) for regex scans. */
export function allTexts(content: SessionContent): string[] {
  const texts: string[] = [];
  for (const message of content.messages) texts.push(message.text);
  for (const toolCall of content.toolCalls) {
    if (toolCall.input) texts.push(toolCall.input);
    if (toolCall.output) texts.push(toolCall.output);
  }
  return texts;
}
