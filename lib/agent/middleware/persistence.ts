import { createMiddleware } from 'langchain';
import { persistUsageEvent } from '@/lib/chat/quota';
import { getRunContext, gmctlStateSchema } from './run-context';

/**
 * afterModel hook: persists the successful assistant usage event (token
 * counts from the AI message's usage_metadata) to Supabase. Short-circuit
 * paths (quota/moderation) persist their own blocked_response events.
 */
export function persistenceMiddleware() {
  return createMiddleware({
    name: 'GmctlPersistence',
    stateSchema: gmctlStateSchema,
    afterModel: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hook: async (state: any, runtime: any) => {
        const ctx = getRunContext(runtime);
        const last = state.messages[state.messages.length - 1];
        if (!last || last.getType() !== 'ai') return;

        const usage = last.usage_metadata ?? {};
        await persistUsageEvent({
          visitorId: state.gmctlQuota?.visitorId,
          sessionId: ctx.sessionId ?? 'unknown',
          messageId: crypto.randomUUID(),
          direction: 'assistant_output',
          provider: ctx.provider ?? 'unknown',
          model: ctx.model ?? 'unknown',
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
        }).catch((e) => console.error('persist assistant usage', e));

        return;
      },
    },
  });
}
