import { describe, expect, it } from 'vitest';

import { pageShell } from './template';

describe('pageShell', () => {
  it('includes level data attribute', () => {
    const html = pageShell('test', '<div>Body</div>');
    expect(html).toContain('data-level="test"');
  });
});
