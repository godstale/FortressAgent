import { describe, it, expect } from 'vitest';
import { resolveThinkValue } from './agent';

describe('resolveThinkValue', () => {
  it('returns undefined (omit think) for model default', () => {
    expect(resolveThinkValue(undefined, undefined)).toBeUndefined();
    expect(resolveThinkValue('default', 'high')).toBeUndefined();
  });

  it('returns false when reasoning is off', () => {
    expect(resolveThinkValue('off', undefined)).toBe(false);
    expect(resolveThinkValue('off', 'high')).toBe(false);
  });

  it('returns the effort level when reasoning is on', () => {
    expect(resolveThinkValue('on', undefined)).toBe('medium');
    expect(resolveThinkValue('on', 'low')).toBe('low');
    expect(resolveThinkValue('on', 'medium')).toBe('medium');
    expect(resolveThinkValue('on', 'high')).toBe('high');
  });
});
