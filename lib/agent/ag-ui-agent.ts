import { AbstractAgent } from '@ag-ui/client';
import type { BaseEvent, RunAgentInput } from '@ag-ui/core';
import { EventType } from '@ag-ui/core';
import { Observable } from 'rxjs';
import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { Provider } from '@/lib/models';
import { getLangfuseCallbacks } from '@/lib/tracing/langfuse';
import { buildAgent } from './agent';
import { getMessageText } from './messages';

interface AgUiMessage {
  id?: string;
  role: string;
  content?: string | null;
  toolCallId?: string;
}

interface RunContext {
  provider: Provider;
  model: string;
  anonId?: string;
  sessionId?: string;
}

const DEFAULT_PROVIDER: Provider = 'anthropic';
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

function toLangChainMessages(messages: AgUiMessage[]): BaseMessage[] {
  const out: BaseMessage[] = [];
  for (const m of messages) {
    const content = m.content ?? '';
    switch (m.role) {
      case 'assistant':
        out.push(new AIMessage(content));
        break;
      case 'tool':
        out.push(new ToolMessage({ content, tool_call_id: m.toolCallId ?? '' }));
        break;
      case 'system':
      case 'developer':
        // Drop incoming system/developer messages: createAgent injects its own
        // system prompt, and a second system message anywhere but position 0
        // is rejected by the model ("system messages only permitted first").
        break;
      case 'user':
      default:
        out.push(new HumanMessage(content));
        break;
    }
  }
  return out;
}

/**
 * Resolves the per-request context (provider/model/anon/session) that the
 * frontend forwards through CopilotKit. Supports both `forwardedProps`
 * (an object) and `context` (an array of { description, value }).
 */
function resolveRunContext(input: RunAgentInput): RunContext {
  const forwarded = (input.forwardedProps ?? {}) as Record<string, unknown>;
  const fromContext: Record<string, unknown> = {};
  for (const entry of input.context ?? []) {
    if (entry && typeof entry.description === 'string') {
      fromContext[entry.description] = entry.value;
    }
  }
  const merged = { ...fromContext, ...forwarded };
  return {
    provider: (merged.provider as Provider) ?? DEFAULT_PROVIDER,
    model: (merged.model as string) ?? DEFAULT_MODEL,
    anonId: merged.anonId as string | undefined,
    sessionId: (merged.sessionId as string | undefined) ?? input.threadId,
  };
}

/**
 * In-process AG-UI agent: runs the LangChain `createAgent` graph (with our
 * quota/moderation/persistence middleware) inside the Node server and maps
 * its state stream to AG-UI events for CopilotKit. No LangGraph deployment.
 */
export class GmctlAgent extends AbstractAgent {
  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      let cancelled = false;

      (async () => {
        const ctx = resolveRunContext(input);
        subscriber.next({
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        } as unknown as BaseEvent);

        try {
          const lcMessages = toLangChainMessages(input.messages as AgUiMessage[]);
          const agent = buildAgent({ provider: ctx.provider, model: ctx.model });

          const runConfig = {
            provider: ctx.provider,
            model: ctx.model,
            anonId: ctx.anonId,
            sessionId: ctx.sessionId,
          };
          const stream = await agent.stream(
            { messages: lcMessages },
            {
              // 'messages' streams model tokens one-by-one; 'values' gives the
              // final state so we can still surface middleware short-circuit
              // (canned) messages that never went through the model.
              streamMode: ['messages', 'values'],
              context: runConfig,
              configurable: runConfig,
              callbacks: getLangfuseCallbacks({
                sessionId: ctx.sessionId,
                userId: ctx.anonId,
                metadata: { provider: ctx.provider, model: ctx.model },
              }),
            },
          );

          const streamedTextIds = new Set<string>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let latestState: any = null;

          // Stream model TEXT tokens one-by-one (mode 'messages'). Tool calls
          // are emitted whole from the final state below — streaming tool-arg
          // chunks confused the client (args leaked as text, cards missed).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for await (const part of stream as AsyncIterable<any>) {
            if (cancelled) break;
            const [mode, data] = part as [string, unknown];
            if (mode === 'values') { latestState = data; continue; }
            // mode === 'messages' -> [messageChunk, metadata]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chunk = (data as any[])[0];
            if (!chunk) continue;
            // Skip tool-call chunks: some providers put partial tool args in
            // `content`, which would leak into the transcript as text.
            if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) continue;
            const msgId: string = chunk.id ?? 'stream';
            const delta = typeof chunk.content === 'string' ? chunk.content : '';
            if (!delta) continue;
            if (!streamedTextIds.has(msgId)) {
              streamedTextIds.add(msgId);
              subscriber.next({
                type: EventType.TEXT_MESSAGE_START,
                messageId: msgId,
                role: 'assistant',
              } as unknown as BaseEvent);
            }
            subscriber.next({
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId: msgId,
              delta,
            } as unknown as BaseEvent);
          }

          for (const id of streamedTextIds) {
            subscriber.next({ type: EventType.TEXT_MESSAGE_END, messageId: id } as unknown as BaseEvent);
          }

          // From the final state: emit tool calls whole (correct reconstruction
          // for card detection) + any assistant text that never streamed
          // (middleware short-circuit / canned messages).
          const finalMsgs = (latestState?.messages ?? []) as BaseMessage[];
          for (let i = lcMessages.length; i < finalMsgs.length; i += 1) {
            const m = finalMsgs[i];
            if (m.getType() !== 'ai') continue;
            const ai = m as AIMessage;
            for (const call of ai.tool_calls ?? []) {
              const tid = call.id ?? crypto.randomUUID();
              subscriber.next({
                type: EventType.TOOL_CALL_START,
                toolCallId: tid,
                toolCallName: call.name,
                parentMessageId: m.id,
              } as unknown as BaseEvent);
              subscriber.next({
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: tid,
                delta: JSON.stringify(call.args ?? {}),
              } as unknown as BaseEvent);
              subscriber.next({ type: EventType.TOOL_CALL_END, toolCallId: tid } as unknown as BaseEvent);
            }
            if (!streamedTextIds.has((m.id as string) ?? '')) {
              const text = getMessageText(ai);
              if (text) {
                const mid = (m.id as string) ?? crypto.randomUUID();
                subscriber.next({ type: EventType.TEXT_MESSAGE_START, messageId: mid, role: 'assistant' } as unknown as BaseEvent);
                subscriber.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: mid, delta: text } as unknown as BaseEvent);
                subscriber.next({ type: EventType.TEXT_MESSAGE_END, messageId: mid } as unknown as BaseEvent);
              }
            }
          }

          subscriber.next({
            type: EventType.RUN_FINISHED,
            threadId: input.threadId,
            runId: input.runId,
          } as unknown as BaseEvent);
          subscriber.complete();
        } catch (error) {
          subscriber.next({
            type: EventType.RUN_ERROR,
            message: error instanceof Error ? error.message : String(error),
          } as unknown as BaseEvent);
          subscriber.error(error);
        }
      })();

      return () => {
        cancelled = true;
      };
    });
  }
}
