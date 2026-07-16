import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Provider } from '@/lib/models';

const OPENROUTER_HEADERS = {
  'HTTP-Referer': 'https://gutemberg.dev',
  'X-Title': 'gmctl agent',
};

export function getChatModel(provider: Provider, modelId: string): BaseChatModel {
  switch (provider) {
    case 'anthropic':
      return new ChatAnthropic({
        model: modelId,
        maxTokens: 200,
        apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      });
    case 'nvidia':
      return new ChatOpenAI({
        model: modelId,
        maxTokens: 200,
        apiKey: process.env.NVIDIA_API_KEY ?? '',
        configuration: { baseURL: 'https://integrate.api.nvidia.com/v1' },
      });
    case 'openrouter':
      return new ChatOpenAI({
        model: modelId,
        maxTokens: 200,
        apiKey: process.env.OPENROUTER_API_KEY ?? '',
        configuration: {
          baseURL: 'https://openrouter.ai/api/v1',
          defaultHeaders: OPENROUTER_HEADERS,
        },
      });
    default:
      return new ChatOpenAI({
        model: 'deepseek-ai/deepseek-v4-pro',
        maxTokens: 200,
        apiKey: process.env.NVIDIA_API_KEY ?? '',
        configuration: { baseURL: 'https://integrate.api.nvidia.com/v1' },
      });
  }
}
