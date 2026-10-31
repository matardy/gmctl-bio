import { AbstractAgent } from '@ag-ui/client';
import type { BaseEvent, RunAgentInput } from '@ag-ui/core';
import { EventType } from '@ag-ui/core';
import { Observable, type Subscriber } from 'rxjs';
import type { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';
import { DEFAULT_MODEL, MODELS, type Provider } from '@/lib/models';
import { getLangfuseCallbacks } from '@/lib/tracing/langfuse';
import { buildAgent } from './agent';
import { getMessageText, inferResponseLanguage } from './messages';
import { toLangChainMessages, type AgUiMessage } from './to-langchain';

interface RunContext {
  provider: Provider;
  model: string;
  anonId?: string;
  sessionId?: string;
}

const DEFAULT_PROVIDER: Provider = 'openrouter';

const MODEL_UNAVAILABLE = {
  en: 'the model is unavailable right now. try again in a moment.',
  es: 'el modelo no está disponible ahora mismo. intenta de nuevo en un momento.',
};

function emitAssistantText(subscriber: Subscriber<BaseEvent>, text: string) {
  const messageId = crypto.randomUUID();
  subscriber.next({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as unknown as BaseEvent);
  subscriber.next({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text } as unknown as BaseEvent);
  subscriber.next({ type: EventType.TEXT_MESSAGE_END, messageId } as unknown as BaseEvent);
}

function finishRun(subscriber: Subscriber<BaseEvent>, input: RunAgentInput) {
  subscriber.next({
    type: EventType.RUN_FINISHED,
    threadId: input.threadId,
    runId: input.runId,
  } as unknown as BaseEvent);
  subscriber.complete();
}

/**
 * Resolves the per-request context (provider/model/anon/session) that the
 * frontend forwards through CopilotKit. Supports both `forwardedProps`
 * (an object) and `context` (an array of { description, value }).
 *
 * provider/model come from the client, so they are checked against the
 * catalog: anything else runs on the default model rather than letting a
 * visitor pick an arbitrary (expensive) model on our OpenRouter key.
 */
export function resolveRunContext(input: RunAgentInput): RunContext {
  const forwarded = (input.forwardedProps ?? {}) as Record<string, unknown>;
  const fromContext: Record<string, unknown> = {};
  for (const entry of input.context ?? []) {
    if (entry && typeof entry.description === 'string') {
      fromContext[entry.description] = entry.value;
    }
  }
  const merged = { ...fromContext, ...forwarded };
  const allowed = MODELS.find((m) => m.provider === merged.provider && m.id === merged.model);
  return {
    provider: allowed?.provider ?? DEFAULT_PROVIDER,
    model: allowed?.id ?? DEFAULT_MODEL.id,
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

        const lcMessages = toLangChainMessages(input.messages as AgUiMessage[]);
        try {
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
            // Anthropic streams text tokens as an array of content blocks, not
            // a plain string — extract text from either shape.
            const delta = typeof chunk.content === 'string' ? chunk.content : getMessageText(chunk);
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

          // From the final state: emit tool calls whole + their results (so
          // CopilotKit's tool renderers see status "complete"), and any
          // assistant text that never streamed (middleware short-circuit /
          // canned messages).
          const finalMsgs = (latestState?.messages ?? []) as BaseMessage[];
          for (let i = lcMessages.length; i < finalMsgs.length; i += 1) {
            const m = finalMsgs[i];
            if (m.getType() === 'tool') {
              const toolMsg = m as ToolMessage;
              subscriber.next({
                type: EventType.TOOL_CALL_RESULT,
                messageId: (toolMsg.id as string) ?? crypto.randomUUID(),
                toolCallId: toolMsg.tool_call_id,
                content: getMessageText(toolMsg),
                role: 'tool',
              } as unknown as BaseEvent);
              continue;
            }
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

          finishRun(subscriber, input);
        } catch (error) {
          // Logged here and traced in Langfuse; the visitor gets a short,
          // localized notice instead of a silently empty chat.
          console.error('[gmctl] agent run failed', error);
          if (cancelled) return;
          emitAssistantText(subscriber, MODEL_UNAVAILABLE[inferResponseLanguage(lcMessages)]);
          finishRun(subscriber, input);
        }
      })();

      return () => {
        cancelled = true;
      };
    });
  }
}
