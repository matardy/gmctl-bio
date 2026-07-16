import { createAgent, modelCallLimitMiddleware } from 'langchain';
import { z } from 'zod';
import type { Provider } from '@/lib/models';
import { getChatModel } from './models';
import { SYSTEM } from './system-prompt';
import { quotaMiddleware } from './middleware/quota';
import { moderationMiddleware } from './middleware/moderation';
import { persistenceMiddleware } from './middleware/persistence';
import { navigateTool } from './tools/navigate';

const TOKENS_LIMIT_24H = Number(process.env.CHAT_TOKENS_LIMIT_24H ?? '12000');
const MODERATION_INTERVAL = Number(process.env.CHAT_MODERATION_EVERY_N_USER_MESSAGES ?? '8');
const MODERATION_MODEL =
  process.env.CHAT_MODERATION_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free';
const MODERATION_TIMEOUT_MS = Number(process.env.CHAT_MODERATION_TIMEOUT_MS ?? '4000');

export interface BuildAgentOptions {
  provider: Provider;
  model: string;
}

/**
 * Builds a stateless gmctl agent per request. Middleware order matters:
 * custom guards short-circuit before spending tokens, the built-in run cap
 * bounds steps, and persistence records usage after a successful model call.
 */
export function buildAgent({ provider, model }: BuildAgentOptions) {
  return createAgent({
    model: getChatModel(provider, model),
    systemPrompt: SYSTEM,
    tools: [navigateTool],
    contextSchema: z.object({
      provider: z.string().optional(),
      model: z.string().optional(),
      anonId: z.string().optional(),
      sessionId: z.string().optional(),
    }),
    middleware: [
      quotaMiddleware({ limit: TOKENS_LIMIT_24H }),
      moderationMiddleware({
        interval: MODERATION_INTERVAL,
        model: MODERATION_MODEL,
        timeoutMs: MODERATION_TIMEOUT_MS,
      }),
      modelCallLimitMiddleware({ runLimit: 2, exitBehavior: 'end' }),
      persistenceMiddleware(),
    ],
  });
}
