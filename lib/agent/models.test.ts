import { beforeAll, describe, expect, it } from 'vitest';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { getChatModel } from './models';

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY ||= 'test-anthropic-key';
  process.env.NVIDIA_API_KEY ||= 'test-nvidia-key';
  process.env.OPENROUTER_API_KEY ||= 'test-openrouter-key';
});

describe('getChatModel', () => {
  it('returns a ChatAnthropic instance for anthropic', () => {
    const model = getChatModel('anthropic', 'claude-haiku-4-5-20251001');
    expect(model).toBeInstanceOf(ChatAnthropic);
  });

  it('returns a ChatOpenAI instance for nvidia', () => {
    const model = getChatModel('nvidia', 'deepseek-ai/deepseek-v4-pro');
    expect(model).toBeInstanceOf(ChatOpenAI);
  });

  it('returns a ChatOpenAI instance for openrouter', () => {
    const model = getChatModel('openrouter', 'qwen/qwen3-coder:free');
    expect(model).toBeInstanceOf(ChatOpenAI);
  });
});
