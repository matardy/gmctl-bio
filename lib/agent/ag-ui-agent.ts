import { AbstractAgent } from '@ag-ui/client';
import type { BaseEvent, RunAgentInput } from '@ag-ui/core';
import { EventType } from '@ag-ui/core';
import { Observable, type Subscriber } from 'rxjs';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
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
  return messages.map((m) => {
    const content = m.content ?? '';
    switch (m.role) {
      case 'assistant':
        return new AIMessage(content);
      case 'system':
      case 'developer':
        return new SystemMessage(content);
      case 'tool':
        return new ToolMessage({ content, tool_call_id: m.toolCallId ?? '' });
      case 'user':
      default:
        return new HumanMessage(content);
    }
  });
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

function emitMessage(
  subscriber: Subscriber<BaseEvent>,
  message: BaseMessage,
): void {
  const type = message.getType();

  if (type === 'ai') {
    const ai = message as AIMessage;
    const toolCalls = ai.tool_calls ?? [];
    for (const call of toolCalls) {
      const toolCallId = call.id ?? crypto.randomUUID();
      subscriber.next({
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: call.name,
        parentMessageId: (ai.id ?? undefined) as string | undefined,
      } as unknown as BaseEvent);
      subscriber.next({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: JSON.stringify(call.args ?? {}),
      } as unknown as BaseEvent);
      subscriber.next({
        type: EventType.TOOL_CALL_END,
        toolCallId,
      } as unknown as BaseEvent);
    }

    const text = getMessageText(ai);
    if (text) {
      const messageId = (ai.id as string | undefined) ?? crypto.randomUUID();
      subscriber.next({
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
      } as unknown as BaseEvent);
      subscriber.next({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: text,
      } as unknown as BaseEvent);
      subscriber.next({
        type: EventType.TEXT_MESSAGE_END,
        messageId,
      } as unknown as BaseEvent);
    }
  }
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

          const stream = await agent.stream(
            { messages: lcMessages },
            {
              streamMode: 'values',
              context: {
                provider: ctx.provider,
                model: ctx.model,
                anonId: ctx.anonId,
                sessionId: ctx.sessionId,
              },
              configurable: {
                provider: ctx.provider,
                model: ctx.model,
                anonId: ctx.anonId,
                sessionId: ctx.sessionId,
              },
              callbacks: getLangfuseCallbacks({
                sessionId: ctx.sessionId,
                userId: ctx.anonId,
                metadata: { provider: ctx.provider, model: ctx.model },
              }),
            },
          );

          // Skip the input messages; only emit messages the graph appends.
          let emitted = lcMessages.length;
          for await (const state of stream) {
            if (cancelled) break;
            const msgs = (state?.messages ?? []) as BaseMessage[];
            for (let i = emitted; i < msgs.length; i += 1) {
              emitMessage(subscriber, msgs[i]);
            }
            if (msgs.length > emitted) {
              emitted = msgs.length;
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
