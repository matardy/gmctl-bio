import { query } from '@/lib/db';
import type { ToolCallRecord } from './transcript';

export const HISTORY_LIMIT = 50;

export type ChatRole = 'user' | 'assistant';

export interface HistoryMessage {
  role: ChatRole;
  content: string;
  created_at: string;
  session_id: string;
  tool_calls: ToolCallRecord[] | null;
}

export interface SessionSummary {
  session_id: string;
  started_at: string;
  preview: string;
  count: number;
}

export async function insertChatMessage(input: {
  anonId: string;
  sessionId: string;
  visitorId: string;
  role: ChatRole;
  content: string;
  toolCalls?: ToolCallRecord[];
}) {
  const toolCalls = input.toolCalls?.length ? JSON.stringify(input.toolCalls) : null;
  await query(
    `INSERT INTO chat_messages (anon_id, session_id, visitor_id, role, content, tool_calls)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.anonId, input.sessionId, input.visitorId, input.role, input.content, toolCalls],
  );
}

/** Newest `limit` messages for a visitor (optionally one session), oldest-first. */
export async function listHistory(input: {
  anonId: string;
  sessionId?: string | null;
  limit?: number;
}): Promise<HistoryMessage[]> {
  const rows = await query<Omit<HistoryMessage, 'created_at'> & { created_at: Date }>(
    `SELECT role, content, created_at, session_id, tool_calls
       FROM chat_messages
      WHERE anon_id = $1 AND ($2::text IS NULL OR session_id = $2)
      ORDER BY created_at DESC
      LIMIT $3`,
    [input.anonId, input.sessionId ?? null, input.limit ?? HISTORY_LIMIT],
  );

  return rows.reverse().map((row) => ({ ...row, created_at: row.created_at.toISOString() }));
}

/** One summary per session (start, message count, first user line), newest-first. */
export async function listSessions(anonId: string): Promise<SessionSummary[]> {
  const rows = await query<Omit<SessionSummary, 'started_at'> & { started_at: Date }>(
    `SELECT session_id,
            MIN(created_at) AS started_at,
            COUNT(*)::int AS count,
            COALESCE(
              LEFT((ARRAY_AGG(content ORDER BY created_at) FILTER (WHERE role = 'user'))[1], 80),
              ''
            ) AS preview
       FROM chat_messages
      WHERE anon_id = $1
      GROUP BY session_id
      ORDER BY started_at DESC`,
    [anonId],
  );

  return rows.map((row) => ({ ...row, started_at: row.started_at.toISOString() }));
}
