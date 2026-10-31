import { describe, expect, it } from 'vitest';
import { collectToolCalls, historyToAgentMessages, parseToolCalls } from './transcript';

describe('parseToolCalls', () => {
  it('returns [] when absent', () => {
    expect(parseToolCalls(undefined)).toEqual([]);
    expect(parseToolCalls(null)).toEqual([]);
  });

  it('accepts well-formed navigate calls', () => {
    const calls = [{ id: 'c1', name: 'navigate', args: { section: 'services' } }];
    expect(parseToolCalls(calls)).toEqual(calls);
  });

  it('rejects unknown tools, bad shapes and oversized payloads (null = invalid)', () => {
    expect(parseToolCalls('nope')).toBeNull();
    expect(parseToolCalls([{ id: 'c1', name: 'rm_rf', args: {} }])).toBeNull();
    expect(parseToolCalls([{ id: '', name: 'navigate', args: {} }])).toBeNull();
    expect(parseToolCalls([{ id: 'c1', name: 'navigate', args: ['x'] }])).toBeNull();
    expect(parseToolCalls([{ id: 'c1', name: 'navigate', args: { section: 'x'.repeat(2000) } }])).toBeNull();
    expect(parseToolCalls(Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, name: 'navigate', args: {} })))).toBeNull();
  });
});

describe('collectToolCalls', () => {
  it('collects navigate calls from assistant messages, deduped, with parsed args', () => {
    const messages = [
      { id: 'u', role: 'user', content: 'hi' },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'c1', type: 'function', function: { name: 'navigate', arguments: '{"section":"services"}' } },
          { id: 'c1', type: 'function', function: { name: 'navigate', arguments: '{"section":"services"}' } },
          { id: 'c2', type: 'function', function: { name: 'other_tool', arguments: '{}' } },
        ],
      },
      { id: 't1', role: 'tool', toolCallId: 'c1', content: '{"section":"services"}' },
    ];
    expect(collectToolCalls(messages)).toEqual([{ id: 'c1', name: 'navigate', args: { section: 'services' } }]);
  });
});

describe('historyToAgentMessages', () => {
  it('rebuilds the reply with its tool calls + results so cards render after the text, as in a live run', () => {
    const rows = [
      { role: 'user' as const, content: 'servicios?' },
      {
        role: 'assistant' as const,
        content: 'aquí están.',
        tool_calls: [{ id: 'c1', name: 'navigate', args: { section: 'services' } }],
      },
    ];
    expect(historyToAgentMessages(rows, 'hist')).toEqual([
      { id: 'hist-0', role: 'user', content: 'servicios?' },
      {
        id: 'hist-1',
        role: 'assistant',
        content: 'aquí están.',
        toolCalls: [{ id: 'c1', type: 'function', function: { name: 'navigate', arguments: '{"section":"services"}' } }],
      },
      { id: 'hist-1-tool-0', role: 'tool', toolCallId: 'c1', content: '{"section":"services"}' },
    ]);
  });

  it('keeps plain rows as single messages', () => {
    expect(historyToAgentMessages([{ role: 'assistant', content: 'hey', tool_calls: null }], 'r')).toEqual([
      { id: 'r-0', role: 'assistant', content: 'hey' },
    ]);
  });
});
