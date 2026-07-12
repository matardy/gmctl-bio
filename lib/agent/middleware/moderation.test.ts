import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';

const insert = vi.fn(async () => ({ error: null }));
const limit = vi.fn(async () => ({ data: [] as unknown[], error: null }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ limit }) }) }),
      insert,
    }),
  },
}));
vi.mock('@/lib/chat/quota', () => ({ persistUsageEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/chat/moderation', async (orig) => {
  const actual = await orig<typeof import('@/lib/chat/moderation')>();
  return {
    ...actual,
    classifyTopicConversation: vi.fn(async () => ({
      verdict: 'off_topic' as const,
      reasonCode: 'unrelated',
      rawLabel: 'off_topic',
      usage: null,
    })),
  };
});

import { moderationMiddleware } from './moderation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runBefore(mw: any, userMsgs: number) {
  const messages = Array.from({ length: userMsgs }, () => new HumanMessage('x'));
  const state = { messages, gmctlQuota: { visitorId: 'visitor-1' } };
  const runtime = { context: { sessionId: 'sess-1', provider: 'anthropic', model: 'm' } };
  return mw.beforeModel.hook(state, runtime);
}

describe('moderationMiddleware beforeModel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing when not at the interval boundary', async () => {
    const result = await runBefore(
      moderationMiddleware({ interval: 8, model: 'm', timeoutMs: 4000 }),
      3,
    );
    expect(result).toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });

  it('warns (short-circuits) on first off-topic at the boundary', async () => {
    const result = await runBefore(
      moderationMiddleware({ interval: 8, model: 'm', timeoutMs: 4000 }),
      8,
    );
    expect(result?.jumpTo).toBe('end');
    expect(insert).toHaveBeenCalled();
    expect(String(result?.messages?.[0]?.content).length).toBeGreaterThan(0);
  });
});
