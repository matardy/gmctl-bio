import { describe, expect, it } from 'vitest';
import { CopilotRuntime, createCopilotRuntimeHandler } from '@copilotkit/runtime/v2';
import { GmctlAgent } from './ag-ui-agent';

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
