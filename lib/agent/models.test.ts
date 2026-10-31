import { describe, expect, it } from 'vitest';
import { ChatOpenRouter } from '@langchain/openrouter';
import { DEFAULT_MODEL, MODELS } from '@/lib/models';
import { getChatModel } from './models';

describe('getChatModel', () => {
  it('returns a ChatOpenRouter for the requested OpenRouter model', () => {
    const model = getChatModel('openrouter', 'anthropic/claude-haiku-5.5') as ChatOpenRouter;
    expect(model).toBeInstanceOf(ChatOpenRouter);
    expect(model.model).toBe('anthropic/claude-haiku-5.5');
    expect(model.maxTokens).toBe(200);
  });

  it('falls back to the default model for an unknown provider', () => {
    const model = getChatModel('nope' as never, 'whatever') as ChatOpenRouter;
    expect(model).toBeInstanceOf(ChatOpenRouter);
    expect(model.model).toBe(DEFAULT_MODEL.id);
  });
});

describe('model catalog', () => {
  it('only lists OpenRouter models and defaults to one of them', () => {
    expect(MODELS.every((m) => m.provider === 'openrouter')).toBe(true);
    expect(MODELS).toContain(DEFAULT_MODEL);
  });
});
