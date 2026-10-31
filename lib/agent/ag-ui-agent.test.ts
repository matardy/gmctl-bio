import { describe, expect, it } from 'vitest';
import type { RunAgentInput } from '@ag-ui/core';
import { CopilotRuntime, createCopilotRuntimeHandler } from '@copilotkit/runtime/v2';
import { DEFAULT_MODEL } from '@/lib/models';
import { GmctlAgent, resolveRunContext } from './ag-ui-agent';

function input(forwardedProps: Record<string, unknown>): RunAgentInput {
  return {
    threadId: 'thread-1',
    runId: 'run-1',
    messages: [],
    tools: [],
    context: [],
    state: {},
    forwardedProps,
  } as unknown as RunAgentInput;
}

describe('GmctlAgent + CopilotKit runtime wiring', () => {
  it('constructs an AG-UI agent exposing run()', () => {
    const agent = new GmctlAgent();
    expect(typeof agent.run).toBe('function');
  });

  it('mounts an in-process CopilotRuntime fetch handler', () => {
    const runtime = new CopilotRuntime({ agents: { gmctl: new GmctlAgent() } });
    const handler = createCopilotRuntimeHandler({ runtime });
    expect(typeof handler).toBe('function');
  });
});

describe('resolveRunContext', () => {
  it('accepts a model from the catalog', () => {
    const ctx = resolveRunContext(input({ provider: 'openrouter', model: 'deepseek/deepseek-v3.2', anonId: 'a1' }));
    expect(ctx).toEqual({ provider: 'openrouter', model: 'deepseek/deepseek-v3.2', anonId: 'a1', sessionId: 'thread-1' });
  });

  it('falls back to the default model for a model outside the catalog (no paying for arbitrary models)', () => {
    const ctx = resolveRunContext(input({ provider: 'openrouter', model: 'anthropic/claude-opus-5.5' }));
    expect(ctx.model).toBe(DEFAULT_MODEL.id);
    expect(ctx.provider).toBe('openrouter');
  });

  it('falls back to the default provider and model when the client sends a stale provider', () => {
    const ctx = resolveRunContext(input({ provider: 'omniroute', model: 'auto/offline' }));
    expect(ctx).toMatchObject({ provider: 'openrouter', model: DEFAULT_MODEL.id });
  });
});
