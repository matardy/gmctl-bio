import { query } from '@/lib/db';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface UsageEventLike {
  total_tokens: number;
  created_at: string;
}

export interface ComputeQuotaSnapshotInput {
  now: Date;
  limit: number;
  events: UsageEventLike[];
}

export interface QuotaSnapshot {
  tokensUsed24h: number;
  tokensRemaining24h: number;
  quotaExhausted: boolean;
}

export interface PersistUsageEventInput {
  visitorId: string;
  sessionId: string;
  messageId: string;
  direction: 'user_input' | 'assistant_output' | 'moderator_check' | 'blocked_response';
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd?: number | null;
}

export function computeQuotaSnapshot(input: ComputeQuotaSnapshotInput): QuotaSnapshot {
  const nowMs = input.now.getTime();
  const windowStart = input.now.getTime() - WINDOW_MS;
  const tokensUsed24h = input.events
    .filter((event) => {
      const createdAtMs = new Date(event.created_at).getTime();
      return createdAtMs >= windowStart && createdAtMs <= nowMs;
    })
    .reduce((sum, event) => sum + event.total_tokens, 0);

  const tokensRemaining24h = Math.max(input.limit - tokensUsed24h, 0);

  return {
    tokensUsed24h,
    tokensRemaining24h,
    quotaExhausted: tokensUsed24h >= input.limit,
  };
}

export function isQuotaExhausted(input: { tokensUsed24h: number; limit: number }) {
  return input.tokensUsed24h >= input.limit;
}

export function createEmptyQuotaSnapshot(limit: number): QuotaSnapshot {
  return {
    tokensUsed24h: 0,
    tokensRemaining24h: limit,
    quotaExhausted: false,
  };
}

export function applyUsageToQuotaSnapshot(input: {
  snapshot: QuotaSnapshot;
  limit: number;
  addedTokens: number;
}): QuotaSnapshot {
  const tokensUsed24h = input.snapshot.tokensUsed24h + Math.max(input.addedTokens, 0);
  const tokensRemaining24h = Math.max(input.limit - tokensUsed24h, 0);

  return {
    tokensUsed24h,
    tokensRemaining24h,
    quotaExhausted: tokensUsed24h >= input.limit,
  };
}

export function toUsageInsert(input: PersistUsageEventInput) {
  return {
    visitor_id: input.visitorId,
    session_id: input.sessionId,
    message_id: input.messageId,
    direction: input.direction,
    provider: input.provider,
    model: input.model,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    total_tokens: Math.max(input.inputTokens, 0) + Math.max(input.outputTokens, 0),
    estimated_cost_usd: input.estimatedCostUsd ?? null,
  };
}

export async function persistUsageEvent(input: PersistUsageEventInput) {
  const row = toUsageInsert(input);
  await query(
    `INSERT INTO chat_usage_events
       (visitor_id, session_id, message_id, direction, provider, model,
        input_tokens, output_tokens, total_tokens, estimated_cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      row.visitor_id,
      row.session_id,
      row.message_id,
      row.direction,
      row.provider,
      row.model,
      row.input_tokens,
      row.output_tokens,
      row.total_tokens,
      row.estimated_cost_usd,
    ],
  );
}

export async function loadQuotaSnapshot(input: {
  visitorId: string;
  limit: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - WINDOW_MS);
  // Sum in the database (served by idx_chat_usage_events_visitor_id_created_at)
  // instead of shipping every event row to the app.
  const [row] = await query<{ used: string }>(
    `SELECT COALESCE(SUM(total_tokens), 0)::bigint AS used
       FROM chat_usage_events
      WHERE visitor_id = $1 AND created_at >= $2 AND created_at <= $3`,
    [input.visitorId, since, now],
  );

  return applyUsageToQuotaSnapshot({
    snapshot: createEmptyQuotaSnapshot(input.limit),
    limit: input.limit,
    addedTokens: Number(row?.used ?? 0),
  });
}
