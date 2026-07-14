export interface GmctlRunContext {
  provider?: string;
  model?: string;
  anonId?: string;
  sessionId?: string;
}

/**
 * Reads the per-request identity (provider/model/anon/session) that the AG-UI
 * agent forwards into the run. LangGraph surfaces these under
 * `runtime.configurable`; we also merge `runtime.context` for forward
 * compatibility.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRunContext(runtime: any): GmctlRunContext {
  return {
    ...(runtime?.context ?? {}),
    ...(runtime?.configurable ?? {}),
  };
}
