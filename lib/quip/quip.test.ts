import { describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@/lib/agent/models', () => ({
  getChatModel: () => ({ invoke }),
}));

import { generateQuip } from './quip';

describe('generateQuip', () => {
  it('formats the quip and strips wrapping quotes', async () => {
    invoke.mockResolvedValueOnce({ content: '"just a joke"' });
    const quip = await generateQuip({ section: 'about', lang: 'en' });
    expect(quip).toBe('→ about · just a joke');
  });

  it('passes recent chat context and section label to the model', async () => {
    invoke.mockResolvedValueOnce({ content: 'chiste corto' });
    const quip = await generateQuip({
      section: 'projects',
      lang: 'es',
      messages: [{ role: 'user', content: 'hola' }],
    });
    expect(quip).toBe('→ projects · chiste corto');
    expect(invoke).toHaveBeenCalled();
  });
});
