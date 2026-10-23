import { describe, expect, it } from 'vitest';
import { PPQ } from '../../src/project/types';

describe('types', () => {
  it('96 ticks par noire, 24 par pas, 384 par mesure', () => {
    expect(PPQ).toBe(96);
    expect(PPQ / 4).toBe(24);
    expect(PPQ * 4).toBe(384);
  });
});
