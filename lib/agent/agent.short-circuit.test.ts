import { beforeAll, describe, expect, it, vi } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';

// The quota-exhausted path short-circuits at the first beforeModel hook, so
// neither Supabase nor the model is actually reached. Stub them so the module
// graph imports cleanly without env/credentials.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/chat/visitor', () => ({
  getOrCreateVisitorCookieId: async () => ({ value: 'cookie-1' }),
  getRequestIpHash: async () => 'ip-hash',
  resolveVisitorIdentity: async () => ({ id: 'visitor-1' }),
}));
vi.mock('@/lib/chat/quota', () => ({
  createEmptyQuotaSnapshot: (limit: number) => ({
    tokensUsed24h: 0,
    tokensRemaining24h: limit,
    quotaExhausted: false,
  }),
  loadQuotaSnapshot: async () => ({
    tokensUsed24h: 99999,
    tokensRemaining24h: 0,
    quotaExhausted: true,
  }),
  persistUsageEvent: async () => {},
}));

import { buildAgent } from './agent';

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY ||= 'test-anthropic-key';
});

describe('agent quota short-circuit (integration)', () => {
  it('returns the canned quota message through the real graph without calling the model', async () => {
    const agent = buildAgent({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' });
    const result = await agent.invoke(
      { messages: [new HumanMessage('hi')] },
      { context: { anonId: 'anon-1', sessionId: 'sess-1', provider: 'anthropic', model: 'm' } },
    );
    const last = result.messages[result.messages.length - 1];
    expect(String(last.content)).toContain('quota');
  });
});
