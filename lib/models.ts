export type Provider = 'nvidia' | 'openrouter' | 'anthropic';

export interface ModelConfig {
  id: string;
  label: string;
  provider: Provider;
  ctx: string;
  free: boolean;
}

export const MODELS: ModelConfig[] = [
  // NVIDIA NIM (free)
  {
    id: 'deepseek-ai/deepseek-v4-pro',
    label: 'deepseek-v4-pro',
    provider: 'nvidia',
    ctx: '1M',
    free: true,
  },
  {
    id: 'deepseek-ai/deepseek-v4-flash',
    label: 'deepseek-v4-flash',
    provider: 'nvidia',
    ctx: '1M',
    free: true,
  },

  // OpenRouter
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    label: 'llama-3.3-70b',
    provider: 'openrouter',
    ctx: '128k',
    free: false,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'llama-3.3-70b (free)',
    provider: 'openrouter',
    ctx: '128k',
    free: true,
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'nemotron-super-120b',
    provider: 'openrouter',
    ctx: '1M',
    free: true,
  },
  {
    id: 'qwen/qwen3-coder:free',
    label: 'qwen3-coder-480b',
    provider: 'openrouter',
    ctx: '1M',
    free: true,
  },
  {
    id: 'openai/gpt-oss-120b:free',
    label: 'gpt-oss-120b',
    provider: 'openrouter',
    ctx: '128k',
    free: true,
  },
  {
    id: 'google/gemma-4-31b-it:free',
    label: 'gemma-4-31b',
    provider: 'openrouter',
    ctx: '256k',
    free: true,
  },
  {
    id: 'mistralai/mistral-7b-instruct:free',
    label: 'mistral-7b',
    provider: 'openrouter',
    ctx: '32k',
    free: true,
  },

  // Anthropic
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'claude-haiku-4.5',
    provider: 'anthropic',
    ctx: '200k',
    free: false,
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'claude-sonnet-4.6',
    provider: 'anthropic',
    ctx: '200k',
    free: false,
  },
];

export const DEFAULT_MODEL = MODELS.find(m => m.id === 'claude-haiku-4-5-20251001')!;

export const MODELS_BY_PROVIDER: Record<Provider, ModelConfig[]> = {
  nvidia: MODELS.filter(m => m.provider === 'nvidia'),
  openrouter: MODELS.filter(m => m.provider === 'openrouter'),
  anthropic: MODELS.filter(m => m.provider === 'anthropic'),
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  nvidia: 'NVIDIA NIM',
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic',
};
