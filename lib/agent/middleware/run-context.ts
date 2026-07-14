import { z } from 'zod';

/**
 * Shared middleware state channel for the resolved visitor + quota snapshot.
 * ALL middleware that read or write `gmctlQuota` must declare this schema so
 * LangGraph treats it as one shared state channel across before/after hooks.
 */
export const gmctlStateSchema = z.object({
  gmctlQuota: z
    .custom<{ visitorId: string; snapshot: { tokensUsed24h: number; tokensRemaining24h: number; quotaExhausted: boolean } }>()
    .optional(),
});

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
