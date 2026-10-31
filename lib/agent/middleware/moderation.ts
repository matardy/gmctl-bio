import { createMiddleware, AIMessage } from 'langchain';
import { persistUsageEvent } from '@/lib/chat/quota';
import { hasBeenWarned, recordModerationEvent } from '@/lib/chat/moderation-events';
import {
  classifyTopicConversation,
  getModerationAction,
  getTopicPolicyCopy,
  shouldRunTopicModeration,
} from '@/lib/chat/moderation';
import { getRunContext, gmctlStateSchema } from './run-context';

export interface ModerationMiddlewareConfig {
  interval: number;
  model: string;
  timeoutMs: number;
}

/**
 * beforeModel guard: every `interval` user messages, classifies the
 * conversation topic and applies soft moderation (warn first, block on
 * repeat), short-circuiting with a localized policy message. Reads the
 * resolved visitor id from the visitor middleware.
 */
export function moderationMiddleware(config: ModerationMiddlewareConfig) {
  return createMiddleware({
    name: 'GmctlModeration',
    stateSchema: gmctlStateSchema,
    beforeModel: {
      canJumpTo: ['end'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hook: async (state: any, runtime: any) => {
        const userCount = state.messages.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (m: any) => m.getType() === 'human',
        ).length;
        if (!shouldRunTopicModeration(userCount, config.interval)) return;

        const ctx = getRunContext(runtime);
        const visitorId = state.gmctlVisitor?.visitorId;
        const sessionId = ctx.sessionId ?? 'unknown';

        const alreadyWarned = await hasBeenWarned(visitorId);

        const verdict = await classifyTopicConversation({
          messages: state.messages,
          model: config.model,
          timeoutMs: config.timeoutMs,
        });
        const action = getModerationAction({
          verdict: verdict.verdict,
          alreadyWarned,
        });

        await recordModerationEvent({
          visitorId,
          sessionId,
          checkedAfterUserMessageCount: userCount,
          verdict: action.verdict,
          reasonCode: verdict.reasonCode,
          rawLabel: verdict.rawLabel,
        });

        if (!action.shouldCallMainModel) {
          const policyVerdict = action.verdict === 'block' ? 'block' : 'warn';
          await persistUsageEvent({
            visitorId,
            sessionId,
            messageId: crypto.randomUUID(),
            direction: 'blocked_response',
            provider: ctx.provider ?? 'unknown',
            model: ctx.model ?? 'unknown',
            inputTokens: 0,
            outputTokens: 0,
          }).catch((e) => console.error('persist blocked moderation response', e));

          return {
            messages: [new AIMessage(getTopicPolicyCopy(policyVerdict, state.messages))],
            jumpTo: 'end' as const,
          };
        }

        return;
      },
    },
  });
}
