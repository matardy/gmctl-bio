import { describe, expect, it, vi } from 'vitest';
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
  loadQuotaSnapshot: vi.fn(),
  persistUsageEvent: vi.fn(async () => {}),
}));

import { loadQuotaSnapshot, persistUsageEvent } from '@/lib/chat/quota';
import { quotaMiddleware } from './quota';

function runBefore(mw: ReturnType<typeof quotaMiddleware>, messages: HumanMessage[]) {
  const runtime = {
    context: { anonId: 'anon-1', sessionId: 'sess-1', provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' },
  };
  return mw.beforeModel.hook({ messages, gmctlVisitor: undefined }, runtime);
}

describe('quotaMiddleware beforeModel', () => {
  it('short-circuits with a canned message when quota is exhausted', async () => {
    (loadQuotaSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue({
      tokensUsed24h: 100000,
      tokensRemaining24h: 0,
      quotaExhausted: true,
    });
    const result = await runBefore(quotaMiddleware({ limit: 100000 }), [new HumanMessage('hi')]);

    expect(String(result?.messages?.[0]?.content)).toContain('quota');
    expect(result?.jumpTo).toBe('end');
    expect(persistUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'blocked_response', provider: 'openrouter' }),
    );
  });

  it('continues and stashes visitor state when quota remains', async () => {
    (loadQuotaSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue({
      tokensUsed24h: 50,
      tokensRemaining24h: 99950,
      quotaExhausted: false,
    });
    const result = await runBefore(quotaMiddleware({ limit: 100000 }), [new HumanMessage('hi')]);

    expect(result?.gmctlVisitor?.visitorId).toBe('visitor-1');
    expect(result?.jumpTo).toBeUndefined();
  });
});
