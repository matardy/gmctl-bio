import { beforeAll, describe, expect, it } from 'vitest';
import { buildAgent } from './agent';

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY ||= 'test-anthropic-key';
  process.env.NVIDIA_API_KEY ||= 'test-nvidia-key';
  process.env.OPENROUTER_API_KEY ||= 'test-openrouter-key';
});

describe('buildAgent', () => {
  it('assembles an agent exposing invoke and stream', () => {
    const agent = buildAgent({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' });
    expect(typeof agent.invoke).toBe('function');
    expect(typeof agent.stream).toBe('function');
  });

  it('assembles for an openai-compatible provider', () => {
    const agent = buildAgent({ provider: 'openrouter', model: 'qwen/qwen3-coder:free' });
    expect(typeof agent.invoke).toBe('function');
  });
});
