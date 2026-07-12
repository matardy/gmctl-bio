import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AIMessage, HumanMessage } from '@langchain/core/messages';

vi.mock('@/lib/chat/quota', () => ({ persistUsageEvent: vi.fn(async () => {}) }));
import { persistUsageEvent } from '@/lib/chat/quota';
import { persistenceMiddleware } from './persistence';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runAfter(mw: any, lastMessage: AIMessage | HumanMessage) {
  const state = { messages: [lastMessage], gmctlQuota: { visitorId: 'visitor-1' } };
  const runtime = { context: { sessionId: 'sess-1', provider: 'anthropic', model: 'm' } };
  return mw.afterModel.hook(state, runtime);
}

describe('persistenceMiddleware afterModel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists assistant usage with token counts', async () => {
    const ai = new AIMessage({
      content: 'hi',
      usage_metadata: { input_tokens: 5, output_tokens: 7, total_tokens: 12 },
    });
    await runAfter(persistenceMiddleware(), ai);
    expect(persistUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'assistant_output',
        visitorId: 'visitor-1',
        inputTokens: 5,
        outputTokens: 7,
      }),
    );
  });

  it('does not persist when the last message is not an AI message', async () => {
    await runAfter(persistenceMiddleware(), new HumanMessage('hi'));
    expect(persistUsageEvent).not.toHaveBeenCalled();
  });
});
