import { describe, expect, it } from 'vitest';
import { clamp, createCounter, decrement, increment } from './counter';

describe('createCounter', () => {
  it('creates a counter with defaults', () => {
    expect(createCounter()).toEqual({ count: 0, min: 0, max: 10 });
  });

  it('clamps the initial value into the allowed range', () => {
    expect(createCounter(99, 0, 10).count).toBe(10);
    expect(createCounter(-5, 0, 10).count).toBe(0);
  });

  it('throws when min is greater than max', () => {
    expect(() => createCounter(0, 5, 1)).toThrow(RangeError);
  });
});

describe('increment', () => {
  it('increments by one by default', () => {
    const state = createCounter(1);
    expect(increment(state).count).toBe(2);
  });

  it('supports a custom step', () => {
    const state = createCounter(1);
    expect(increment(state, 4).count).toBe(5);
  });

  it('does not exceed the maximum', () => {
    const state = createCounter(9, 0, 10);
    expect(increment(state, 5).count).toBe(10);
  });

  it('does not mutate the previous state', () => {
    const state = createCounter(1);
    increment(state);
    expect(state.count).toBe(1);
  });
});

describe('decrement', () => {
  it('decrements by one by default', () => {
    const state = createCounter(3);
    expect(decrement(state).count).toBe(2);
  });

  it('does not go below the minimum', () => {
    const state = createCounter(1, 0, 10);
    expect(decrement(state, 5).count).toBe(0);
  });
});

describe('clamp', () => {
  it('returns the value when inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to the bounds', () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});
