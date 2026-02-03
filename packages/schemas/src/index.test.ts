import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

const schemaUrl = new URL('../schemas/action-plan.schema.json', import.meta.url);

describe('schemas', () => {
  it('loads action plan schema', () => {
    const data = JSON.parse(fs.readFileSync(schemaUrl, 'utf-8')) as { title?: string };
    expect(data.title).toBe('ActionPlan');
  });
});
