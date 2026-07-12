import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';

vi.mock('@/lib/chat/visitor', () => ({
  getOrCreateVisitorCookieId: vi.fn(async () => ({ value: 'cookie-1' })),
  getRequestIpHash: vi.fn(async () => 'ip-hash'),
  resolveVisitorIdentity: vi.fn(async () => ({ id: 'visitor-1' })),
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runBefore(mw: any, messages: HumanMessage[]) {
  const runtime = {
    context: { anonId: 'anon-1', sessionId: 'sess-1', provider: 'anthropic', model: 'm' },
  };
  return mw.beforeModel.hook({ messages, gmctlQuota: undefined }, runtime);
}

describe('quotaMiddleware beforeModel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('short-circuits with a canned message when quota is exhausted', async () => {
    (loadQuotaSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue({
      tokensUsed24h: 12000,
      tokensRemaining24h: 0,
      quotaExhausted: true,
    });
    const result = await runBefore(quotaMiddleware({ limit: 12000 }), [new HumanMessage('hi')]);
    expect(result?.jumpTo).toBe('end');
    expect(String(result?.messages?.[0]?.content)).toContain('quota');
    expect(persistUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'blocked_response' }),
    );
  });

  it('continues (returns state without jumpTo) when quota remains', async () => {
    (loadQuotaSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue({
      tokensUsed24h: 10,
      tokensRemaining24h: 11990,
      quotaExhausted: false,
    });
    const result = await runBefore(quotaMiddleware({ limit: 12000 }), [new HumanMessage('hi')]);
    expect(result?.jumpTo).toBeUndefined();
    expect(result?.gmctlQuota?.visitorId).toBe('visitor-1');
    expect(persistUsageEvent).not.toHaveBeenCalled();
  });
});
