import { ChatOpenRouter } from '@langchain/openrouter';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { DEFAULT_MODEL, type Provider } from '@/lib/models';

const MAX_TOKENS = 200;

// OpenRouter app attribution (shows up in the OpenRouter dashboard).
const ATTRIBUTION = {
  siteUrl: process.env.OPENROUTER_SITE_URL ?? 'https://gutemberg.dev',
  siteName: 'gmctl agent',
};

/**
 * Chat model for a provider/model pair. The API key comes from
 * OPENROUTER_API_KEY. Unknown providers fall back to the default model so a
 * stale client selection never breaks a run.
 */
export function getChatModel(provider: Provider, modelId: string): BaseChatModel {
  switch (provider) {
    case 'openrouter':
      return new ChatOpenRouter({ model: modelId, maxTokens: MAX_TOKENS, ...ATTRIBUTION });
    default:
      return new ChatOpenRouter({ model: DEFAULT_MODEL.id, maxTokens: MAX_TOKENS, ...ATTRIBUTION });
  }
}
