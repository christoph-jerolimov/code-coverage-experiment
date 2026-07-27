import { describe, expect, it } from 'vitest';
import { capitalize, greet } from './greeting';

describe('greet', () => {
  it('greets a person by name', () => {
    expect(greet('astro')).toBe('Hello, Astro!');
  });

  it('trims surrounding whitespace', () => {
    expect(greet('  ada  ')).toBe('Hello, Ada!');
  });

  it('falls back to a generic greeting for empty input', () => {
    expect(greet('')).toBe('Hello, stranger!');
    expect(greet('   ')).toBe('Hello, stranger!');
  });
});

describe('capitalize', () => {
  it('uppercases the first letter', () => {
    expect(capitalize('vitest')).toBe('Vitest');
  });

  it('leaves an already capitalized word unchanged', () => {
    expect(capitalize('Astro')).toBe('Astro');
  });

  it('returns an empty string unchanged', () => {
    expect(capitalize('')).toBe('');
  });
});
