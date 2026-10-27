import { describe, expect, it } from 'vitest';

import { packageName } from './index.js';

describe('@mixline/backend', () => {
  it('exports its package name', () => {
    expect(packageName).toBe('@mixline/backend');
  });
});
