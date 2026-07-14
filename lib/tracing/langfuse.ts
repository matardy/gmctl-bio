import { CallbackHandler } from '@langfuse/langchain';
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';

export interface LangfuseCallbackOptions {
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Returns the LangChain callbacks that export traces to Langfuse via the OTEL
 * span processor configured in `instrumentation.ts`. Returns an empty array
 * when Langfuse keys are absent, so tracing stays optional and never throws.
 */
export function getLangfuseCallbacks(opts: LangfuseCallbackOptions = {}): BaseCallbackHandler[] {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return [];
  }
  return [new CallbackHandler(opts)];
}
