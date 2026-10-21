import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from '../src/index';

describe('core', () => {
  it('expose sa version', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });
});
