export interface CounterState {
  count: number;
  min: number;
  max: number;
}

export function createCounter(initial = 0, min = 0, max = 10): CounterState {
  if (min > max) {
    throw new RangeError(`min (${min}) must not be greater than max (${max})`);
  }
  return { count: clamp(initial, min, max), min, max };
}

export function increment(state: CounterState, step = 1): CounterState {
  return { ...state, count: clamp(state.count + step, state.min, state.max) };
}

export function decrement(state: CounterState, step = 1): CounterState {
  return { ...state, count: clamp(state.count - step, state.min, state.max) };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
