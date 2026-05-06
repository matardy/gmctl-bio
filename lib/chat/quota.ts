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

export function computeQuotaSnapshot(input: ComputeQuotaSnapshotInput): QuotaSnapshot {
  const windowStart = input.now.getTime() - WINDOW_MS;
  const tokensUsed24h = input.events
    .filter((event) => new Date(event.created_at).getTime() >= windowStart)
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
