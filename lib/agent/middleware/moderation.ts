import { createMiddleware, AIMessage } from 'langchain';
import { supabase } from '@/lib/supabase';
import { persistUsageEvent } from '@/lib/chat/quota';
import {
  classifyTopicConversation,
  getModerationAction,
  getTopicPolicyCopy,
  shouldRunTopicModeration,
} from '@/lib/chat/moderation';
import { getRunContext } from './run-context';

export interface ModerationMiddlewareConfig {
  interval: number;
  model: string;
  timeoutMs: number;
}

/**
 * beforeModel guard: every `interval` user messages, classifies the
 * conversation topic and applies soft moderation (warn first, block on
 * repeat), short-circuiting with a localized policy message. Reads the
 * resolved visitor id from the `gmctlQuota` state set by the quota middleware.
 */
export function moderationMiddleware(config: ModerationMiddlewareConfig) {
  return createMiddleware({
    name: 'GmctlModeration',
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
        const visitorId = state.gmctlQuota?.visitorId;
        const sessionId = ctx.sessionId ?? 'unknown';

        const { data: warningRows, error: warningError } = await supabase
          .from('topic_moderation_events')
          .select('id')
          .eq('visitor_id', visitorId)
          .eq('verdict', 'warn')
          .limit(1);
        if (warningError) throw warningError;

        const verdict = await classifyTopicConversation({
          messages: state.messages,
          model: config.model,
          timeoutMs: config.timeoutMs,
        });
        const action = getModerationAction({
          verdict: verdict.verdict,
          alreadyWarned: (warningRows?.length ?? 0) > 0,
        });

        const { error: insertError } = await supabase.from('topic_moderation_events').insert({
          visitor_id: visitorId,
          session_id: sessionId,
          checked_after_user_message_count: userCount,
          verdict: action.verdict,
          reason_code: verdict.reasonCode,
          raw_label: verdict.rawLabel,
        });
        if (insertError) throw insertError;

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
