import { describe, expect, it } from 'vitest';
import { computeQuotaSnapshot, isQuotaExhausted } from './quota';

describe('computeQuotaSnapshot', () => {
  it('counts only events inside the last 24 hours', () => {
    const now = new Date('2026-05-05T12:00:00.000Z');
    const snapshot = computeQuotaSnapshot({
      now,
      limit: 1000,
      events: [
        { total_tokens: 300, created_at: '2026-05-05T11:30:00.000Z' },
        { total_tokens: 200, created_at: '2026-05-04T13:00:00.000Z' },
        { total_tokens: 900, created_at: '2026-05-04T11:00:00.000Z' },
      ],
    });

    expect(snapshot.tokensUsed24h).toBe(500);
    expect(snapshot.tokensRemaining24h).toBe(500);
  });

  it('marks the visitor exhausted once the limit is reached', () => {
    expect(isQuotaExhausted({ tokensUsed24h: 1000, limit: 1000 })).toBe(true);
  });
});
