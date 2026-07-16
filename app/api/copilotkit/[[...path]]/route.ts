import { CopilotRuntime, createCopilotRuntimeHandler } from '@copilotkit/runtime/v2';
import { GmctlAgent } from '@/lib/agent/ag-ui-agent';

export const runtime = 'nodejs';

// Registered under both the conventional "default" key (used by <CopilotChat>
// when no agentId is given) and an explicit "gmctl" alias.
const copilotRuntime = new CopilotRuntime({
  agents: { default: new GmctlAgent(), gmctl: new GmctlAgent() },
});

const handler = createCopilotRuntimeHandler({
  runtime: copilotRuntime,
  basePath: '/api/copilotkit',
  mode: 'single-route',
});

export const GET = (req: Request) => handler(req);
export const POST = (req: Request) => handler(req);
export const OPTIONS = (req: Request) => handler(req);
