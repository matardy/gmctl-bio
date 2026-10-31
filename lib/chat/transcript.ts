// Client-safe helpers for persisting and restoring generative-UI tool calls.
// (No server imports here: chat.tsx uses these in the browser.)

/** A tool call made by the agent during an assistant turn, as stored. */
export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Tools whose calls drive UI and are worth restoring after a reload. */
export const PERSISTED_TOOL_NAMES = new Set(['navigate']);

const MAX_CALLS = 10;
const MAX_ID_LENGTH = 200;
const MAX_ARGS_JSON = 1000;

/** AG-UI message shape (subset) as found in `agent.messages`. */
export interface AgentMessageLike {
  id: string;
  role: string;
  content?: unknown;
  toolCallId?: string;
  toolCalls?: { id: string; type?: string; function?: { name?: string; arguments?: string } }[];
}

export interface HistoryRowLike {
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: ToolCallRecord[] | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates untrusted `tool_calls` from the history API.
 * Returns [] when absent, the calls when valid, or null when invalid.
 */
export function parseToolCalls(input: unknown): ToolCallRecord[] | null {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > MAX_CALLS) return null;

  const calls: ToolCallRecord[] = [];
  for (const item of input) {
    if (!isPlainObject(item)) return null;
    const { id, name, args } = item;
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH) return null;
    if (typeof name !== 'string' || !PERSISTED_TOOL_NAMES.has(name)) return null;
    if (!isPlainObject(args) || JSON.stringify(args).length > MAX_ARGS_JSON) return null;
    calls.push({ id, name, args });
  }
  return calls;
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Persistable tool calls made by assistant messages (deduped by id). */
export function collectToolCalls(messages: AgentMessageLike[]): ToolCallRecord[] {
  const seen = new Set<string>();
  const calls: ToolCallRecord[] = [];
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    for (const call of m.toolCalls ?? []) {
      const name = call.function?.name;
      if (!call.id || !name || !PERSISTED_TOOL_NAMES.has(name) || seen.has(call.id)) continue;
      seen.add(call.id);
      calls.push({ id: call.id, name, args: parseArgs(call.function?.arguments) });
    }
  }
  return calls;
}

/**
 * Rebuilds `agent.messages` from stored history. An assistant row with tool
 * calls becomes assistant(text + toolCalls) followed by the tool results — the
 * shape of a live run, so tool renderers draw the cards after the reply text.
 */
export function historyToAgentMessages(rows: HistoryRowLike[], idPrefix: string): AgentMessageLike[] {
  const out: AgentMessageLike[] = [];
  rows.forEach((row, i) => {
    const id = `${idPrefix}-${i}`;
    const calls = row.role === 'assistant' ? row.tool_calls ?? [] : [];
    if (calls.length === 0) {
      out.push({ id, role: row.role, content: row.content });
      return;
    }
    out.push({
      id,
      role: 'assistant',
      content: row.content,
      toolCalls: calls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    });
    calls.forEach((c, j) => {
      out.push({ id: `${id}-tool-${j}`, role: 'tool', toolCallId: c.id, content: JSON.stringify(c.args) });
    });
  });
  return out;
}
