export type Provider = 'openrouter';

export interface ModelConfig {
  id: string;
  label: string;
  provider: Provider;
  ctx: string;
  free: boolean;
}

// OpenRouter model ids (https://openrouter.ai/models). All support tool
// calling, which the agent needs for `navigate`. Non-reasoning models only:
// replies are capped at 200 tokens, which reasoning models can burn on
// hidden thinking before answering.
export const MODELS: ModelConfig[] = [
  {
    id: 'anthropic/claude-haiku-5.5',
    label: 'claude-haiku-5.5',
    provider: 'openrouter',
    ctx: '1M',
    free: false,
  },
  {
    id: 'google/gemini-3.1-flash-lite',
    label: 'gemini-3.1-flash-lite',
    provider: 'openrouter',
    ctx: '1M',
    free: false,
  },
  {
    id: 'deepseek/deepseek-v3.2',
    label: 'deepseek-v3.2',
    provider: 'openrouter',
    ctx: '164k',
    free: false,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    label: 'llama-3.3-70b',
    provider: 'openrouter',
    ctx: '131k',
    free: false,
  },
  {
    id: 'google/gemma-4-31b-it:free',
    label: 'gemma-4-31b (free)',
    provider: 'openrouter',
    ctx: '262k',
    free: true,
  },
];

export const DEFAULT_MODEL = MODELS.find(m => m.id === 'anthropic/claude-haiku-5.5')!;

export const MODELS_BY_PROVIDER: Record<Provider, ModelConfig[]> = {
  openrouter: MODELS.filter(m => m.provider === 'openrouter'),
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  openrouter: 'OpenRouter',
};

export const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];
