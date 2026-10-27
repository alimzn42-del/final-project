import { describe, expect, it } from 'vitest';

import { packageName } from './index.js';

describe('@mixline/simulator', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@mixline/simulator');
  });
});
