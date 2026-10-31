import { describe, expect, it } from 'vitest';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { toLangChainMessages, type AgUiMessage } from './to-langchain';

const call = (id: string, section: string) => ({
  id,
  type: 'function' as const,
  function: { name: 'navigate', arguments: JSON.stringify({ section }) },
});

function shape(messages: ReturnType<typeof toLangChainMessages>) {
  return messages.map((m) => {
    const base = { type: m.getType(), content: m.content };
    if (m instanceof AIMessage && m.tool_calls?.length) {
      return { ...base, tool_calls: m.tool_calls.map((c) => ({ id: c.id, name: c.name, args: c.args })) };
    }
    if (m instanceof ToolMessage) return { ...base, tool_call_id: m.tool_call_id };
    return base;
  });
}

describe('toLangChainMessages', () => {
  it('maps user/assistant text and drops system/developer messages', () => {
    const input: AgUiMessage[] = [
      { id: '0', role: 'system', content: 'ignored' },
      { id: '1', role: 'user', content: 'hola' },
      { id: '2', role: 'assistant', content: 'hey' },
      { id: '3', role: 'developer', content: 'ignored' },
    ];
    expect(shape(toLangChainMessages(input))).toEqual([
      { type: 'human', content: 'hola' },
      { type: 'ai', content: 'hey' },
    ]);
  });

  it('places each tool result right after the assistant call that produced it', () => {
    // AG-UI appends tool results at the end, after later assistant text.
    const input: AgUiMessage[] = [
      { id: '1', role: 'user', content: 'servicios?' },
      { id: '2', role: 'assistant', content: '', toolCalls: [call('c1', 'services')] },
      { id: '3', role: 'assistant', content: 'aquí están.' },
      { id: '4', role: 'tool', toolCallId: 'c1', content: '{"section":"services"}' },
    ];
    expect(shape(toLangChainMessages(input))).toEqual([
      { type: 'human', content: 'servicios?' },
      { type: 'ai', content: '', tool_calls: [{ id: 'c1', name: 'navigate', args: { section: 'services' } }] },
      { type: 'tool', content: '{"section":"services"}', tool_call_id: 'c1' },
      { type: 'ai', content: 'aquí están.' },
    ]);
  });

  it('drops tool calls without a result and results without a call', () => {
    const input: AgUiMessage[] = [
      { id: '1', role: 'user', content: 'x' },
      { id: '2', role: 'assistant', content: 'ok', toolCalls: [call('c-pending', 'projects')] },
      { id: '3', role: 'tool', toolCallId: 'c-orphan', content: '{}' },
    ];
    expect(shape(toLangChainMessages(input))).toEqual([
      { type: 'human', content: 'x' },
      { type: 'ai', content: 'ok' },
    ]);
  });

  it('drops an assistant message left empty after removing its unanswered calls', () => {
    const input: AgUiMessage[] = [
      { id: '1', role: 'user', content: 'x' },
      { id: '2', role: 'assistant', content: '', toolCalls: [call('c-pending', 'projects')] },
    ];
    expect(shape(toLangChainMessages(input))).toEqual([{ type: 'human', content: 'x' }]);
  });

  it('treats malformed tool arguments as an empty object', () => {
    const input: AgUiMessage[] = [
      {
        id: '2',
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'c1', type: 'function', function: { name: 'navigate', arguments: '{oops' } }],
      },
      { id: '3', role: 'tool', toolCallId: 'c1', content: '{}' },
    ];
    const [ai] = toLangChainMessages(input) as AIMessage[];
    expect(ai.tool_calls?.[0].args).toEqual({});
  });
});
