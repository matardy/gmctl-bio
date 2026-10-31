import { createMiddleware, AIMessage } from 'langchain';
import {
  loadQuotaSnapshot,
  persistUsageEvent,
  type QuotaSnapshot,
} from '@/lib/chat/quota';
import {
  getOrCreateVisitorCookieId,
  getRequestIpHash,
  resolveVisitorIdentity,
} from '@/lib/chat/visitor';
import { getQuotaExceededCopy } from '@/lib/chat/moderation';
import { getRunContext, gmctlStateSchema } from './run-context';

export interface QuotaMiddlewareConfig {
  limit: number;
}

export interface GmctlVisitorState {
  visitorId: string;
  snapshot: QuotaSnapshot;
}

/**
 * Best-effort anonymous daily token guard. This is not a hard anti-abuse
 * boundary, but it keeps ordinary usage within a configurable 24h budget while
 * OpenRouter enforces upstream provider limits and spend.
 */
export function quotaMiddleware(config: QuotaMiddlewareConfig) {
  return createMiddleware({
    name: 'GmctlQuota',
    stateSchema: gmctlStateSchema,
    beforeModel: {
      canJumpTo: ['end'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hook: async (state: any, runtime: any) => {
        const ctx = getRunContext(runtime);
        let cookieId: string | null = null;
        let ipHash: string | null = null;
        try {
          cookieId = (await getOrCreateVisitorCookieId()).value;
          ipHash = await getRequestIpHash();
        } catch (e) {
          console.warn('visitor cookie/ip unavailable, using anonId only', e);
        }

        const visitor = await resolveVisitorIdentity({
          anonId: ctx.anonId ?? null,
          cookieId,
          ipHash,
        });
        const snapshot = await loadQuotaSnapshot({ visitorId: visitor.id, limit: config.limit });

        if (snapshot.quotaExhausted) {
          await persistUsageEvent({
            visitorId: visitor.id,
            sessionId: ctx.sessionId ?? 'unknown',
            messageId: crypto.randomUUID(),
            direction: 'blocked_response',
            provider: ctx.provider ?? 'unknown',
            model: ctx.model ?? 'unknown',
            inputTokens: 0,
            outputTokens: 0,
          }).catch((e) => console.error('persist blocked quota response', e));

          return {
            messages: [new AIMessage(getQuotaExceededCopy(state.messages))],
            gmctlVisitor: { visitorId: visitor.id, snapshot },
            jumpTo: 'end' as const,
          };
        }

        return { gmctlVisitor: { visitorId: visitor.id, snapshot } };
      },
    },
  });
}
