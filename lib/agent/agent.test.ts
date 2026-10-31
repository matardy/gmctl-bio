import { beforeAll, describe, expect, it } from 'vitest';
import { buildAgent } from './agent';

beforeAll(() => {
  process.env.OPENROUTER_API_KEY ||= 'test-openrouter-key';
});

describe('buildAgent', () => {
  it('assembles an agent exposing invoke and stream', () => {
    const agent = buildAgent({ provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' });
    expect(typeof agent.invoke).toBe('function');
    expect(typeof agent.stream).toBe('function');
  });

  it('assembles for another OpenRouter model', () => {
    const agent = buildAgent({ provider: 'openrouter', model: 'google/gemini-3.1-flash-lite' });
    expect(typeof agent.invoke).toBe('function');
  });
});
