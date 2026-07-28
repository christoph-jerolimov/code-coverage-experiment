import { describe, expect, it } from 'vitest';

import {
  allTexts,
  collectSessionIds,
  normalizeMessages,
  normalizeSessionList,
  normalizeToolCalls,
  toText,
} from './normalize.ts';

describe('normalizeSessionList', () => {
  it('accepts a bare array with snake_case fields', () => {
    const sessions = normalizeSessionList([
      { session_id: 'abc', project: 'rhdh', machine: 'laptop', started_at: '2026-07-01T10:00:00Z' },
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: 'abc', project: 'rhdh', machine: 'laptop' });
  });

  it('accepts a wrapping object and camelCase fields', () => {
    const sessions = normalizeSessionList({
      sessions: [{ id: 'x1', gitBranch: 'main', startedAt: '2026-07-01' }],
    });
    expect(sessions[0]).toMatchObject({ id: 'x1', gitBranch: 'main', startedAt: '2026-07-01' });
  });

  it('drops entries without an id', () => {
    expect(normalizeSessionList([{ project: 'p' }, null, 'junk'])).toHaveLength(0);
  });
});

describe('normalizeToolCalls', () => {
  it('normalizes names and stringifies object inputs', () => {
    const calls = normalizeToolCalls({
      tool_calls: [{ tool_name: 'Bash', input: { command: 'gh pr create' }, output: 'ok' }],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.toolName).toBe('Bash');
    expect(calls[0]!.input).toContain('gh pr create');
    expect(calls[0]!.output).toBe('ok');
  });

  it('accepts alternate field spellings', () => {
    const calls = normalizeToolCalls([{ name: 'Skill', arguments: { skill: 'rhdh-jira' }, result: 'done' }]);
    expect(calls[0]).toMatchObject({ toolName: 'Skill', output: 'done' });
    expect(calls[0]!.input).toContain('rhdh-jira');
  });
});

describe('normalizeMessages', () => {
  it('flattens content-block arrays into text', () => {
    const messages = normalizeMessages({
      messages: [
        { role: 'assistant', content: [{ type: 'text', text: 'RHDH-1 is done' }, 'extra'] },
        { role: 'user', text: 'thanks' },
      ],
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]!.text).toContain('RHDH-1 is done');
    expect(messages[0]!.text).toContain('extra');
    expect(messages[1]).toMatchObject({ role: 'user', text: 'thanks' });
  });

  it('drops messages without text', () => {
    expect(normalizeMessages([{ role: 'user' }])).toHaveLength(0);
  });
});

describe('collectSessionIds', () => {
  it('collects ids from nested result shapes', () => {
    const ids = collectSessionIds({
      results: [
        { session_id: 'a', snippet: '...' },
        { session: { id: 'b' } },
      ],
    });
    expect(ids.has('a')).toBe(true);
    expect(ids.has('b')).toBe(true);
  });
});

describe('toText', () => {
  it('handles strings, numbers, arrays and objects', () => {
    expect(toText('x')).toBe('x');
    expect(toText(42)).toBe('42');
    expect(toText(['a', 'b'])).toBe('a\nb');
    expect(toText({ text: 'inner' })).toBe('inner');
    expect(toText({ command: 'ls' })).toBe('{"command":"ls"}');
    expect(toText(null)).toBe('');
  });
});

describe('allTexts', () => {
  it('includes messages, tool inputs and tool outputs', () => {
    const texts = allTexts({
      messages: [{ role: 'user', text: 'msg', raw: {} }],
      toolCalls: [{ toolName: 'Bash', input: 'in', output: 'out', raw: {} }],
    });
    expect(texts).toEqual(['msg', 'in', 'out']);
  });
});
