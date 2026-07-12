import { createAgent, modelCallLimitMiddleware } from 'langchain';
import type { Provider } from '@/lib/models';
import { getChatModel } from './models';
import { SYSTEM } from './system-prompt';

export interface BuildAgentOptions {
  provider: Provider;
  model: string;
}

export function buildAgent({ provider, model }: BuildAgentOptions) {
  return createAgent({
    model: getChatModel(provider, model),
    systemPrompt: SYSTEM,
    tools: [],
    middleware: [
      modelCallLimitMiddleware({ runLimit: 2, exitBehavior: 'end' }),
    ],
  });
}
