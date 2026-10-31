import {
  AIMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';

/** AG-UI message as forwarded by CopilotKit in RunAgentInput.messages. */
export interface AgUiMessage {
  id?: string;
  role: string;
  content?: string | null;
  toolCallId?: string;
  toolCalls?: {
    id: string;
    type?: 'function';
    function: { name: string; arguments?: string };
  }[];
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Converts the AG-UI transcript into a history the model API accepts.
 *
 * Chat-completions APIs require every `tool` message to follow the assistant
 * message whose tool_calls produced it, and every tool call to have a result.
 * AG-UI appends tool results at the end of the list (after later assistant
 * text), so results are re-attached right after their call; calls without a
 * result and results without a call are dropped.
 */
export function toLangChainMessages(messages: AgUiMessage[]): BaseMessage[] {
  const results = new Map<string, string>();
  for (const m of messages) {
    if (m.role === 'tool' && m.toolCallId) results.set(m.toolCallId, m.content ?? '');
  }

  const out: BaseMessage[] = [];
  for (const m of messages) {
    const content = m.content ?? '';
    switch (m.role) {
      case 'assistant': {
        const answered = (m.toolCalls ?? []).filter((c) => results.has(c.id));
        if (!content && answered.length === 0) break;
        out.push(
          new AIMessage({
            content,
            tool_calls: answered.map((c) => ({
              id: c.id,
              name: c.function.name,
              args: parseArgs(c.function.arguments),
              type: 'tool_call' as const,
            })),
          }),
        );
        for (const c of answered) {
          out.push(new ToolMessage({ content: results.get(c.id)!, tool_call_id: c.id }));
        }
        break;
      }
      case 'tool':
        // Emitted right after its assistant call above.
        break;
      case 'system':
      case 'developer':
        // createAgent injects its own system prompt, and a second system
        // message anywhere but position 0 is rejected by the model.
        break;
      case 'user':
      default:
        out.push(new HumanMessage(content));
        break;
    }
  }
  return out;
}
