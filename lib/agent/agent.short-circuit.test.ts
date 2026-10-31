import { beforeAll, describe, expect, it, vi } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';

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
    tokensUsed24h: 100000,
    tokensRemaining24h: 0,
    quotaExhausted: true,
  }),
  persistUsageEvent: async () => {},
}));

import { buildAgent } from './agent';

beforeAll(() => {
  process.env.OPENROUTER_API_KEY ||= 'test-openrouter-key';
});

describe('agent quota short-circuit (integration)', () => {
  it('returns the canned quota message through the real graph without calling the model', async () => {
    const agent = buildAgent({ provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' });
    const result = await agent.invoke(
      { messages: [new HumanMessage('hi')] },
      { context: { anonId: 'anon-1', sessionId: 'sess-1', provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' } },
    );
    const last = result.messages[result.messages.length - 1];
    expect(String(last.content)).toContain('quota');
  });
});
