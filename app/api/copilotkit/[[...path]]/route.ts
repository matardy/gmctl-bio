import { CopilotRuntime, createCopilotRuntimeHandler } from '@copilotkit/runtime/v2';
import { GmctlAgent } from '@/lib/agent/ag-ui-agent';

export const runtime = 'nodejs';

const copilotRuntime = new CopilotRuntime({
  agents: { gmctl: new GmctlAgent() },
});

const handler = createCopilotRuntimeHandler({ runtime: copilotRuntime });

export const GET = (req: Request) => handler(req);
export const POST = (req: Request) => handler(req);
export const OPTIONS = (req: Request) => handler(req);
