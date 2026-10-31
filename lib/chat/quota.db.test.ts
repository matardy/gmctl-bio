import { describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import { insertVisitor } from "@/tests/db-fixtures";
import { loadQuotaSnapshot, persistUsageEvent } from "./quota";

const HOUR = 60 * 60 * 1000;

async function usageAt(visitorId: string, tokens: number, createdAt: Date) {
  await query(
    `INSERT INTO chat_usage_events
       (visitor_id, session_id, message_id, direction, provider, model, input_tokens, output_tokens, total_tokens, created_at)
     VALUES ($1, 's', 'm', 'assistant_output', 'p', 'm', $2, 0, $2, $3)`,
    [visitorId, tokens, createdAt],
  );
}

describe("persistUsageEvent", () => {
  it("stores the event with total = input + output", async () => {
    const visitorId = await insertVisitor({ anon_id: "a" });
    await persistUsageEvent({
      visitorId,
      sessionId: "sess-1",
      messageId: "msg-1",
      direction: "assistant_output",
      provider: "openrouter",
      model: "auto",
      inputTokens: 120,
      outputTokens: 30,
    });

    const rows = await query(
      "SELECT session_id, message_id, direction, input_tokens, output_tokens, total_tokens, estimated_cost_usd FROM chat_usage_events",
    );
    expect(rows).toEqual([
      {
        session_id: "sess-1",
        message_id: "msg-1",
        direction: "assistant_output",
        input_tokens: 120,
        output_tokens: 30,
        total_tokens: 150,
        estimated_cost_usd: null,
      },
    ]);
  });
});

describe("loadQuotaSnapshot", () => {
  it("sums only this visitor's tokens inside the rolling 24h window", async () => {
    const now = new Date("2026-10-31T12:00:00Z");
    const me = await insertVisitor({ anon_id: "me" });
    const other = await insertVisitor({ anon_id: "other" });

    await usageAt(me, 400, new Date(now.getTime() - 1 * HOUR));
    await usageAt(me, 100, new Date(now.getTime() - 23 * HOUR));
    await usageAt(me, 9000, new Date(now.getTime() - 25 * HOUR)); // outside window
    await usageAt(other, 7000, new Date(now.getTime() - 1 * HOUR)); // another visitor

    const snapshot = await loadQuotaSnapshot({ visitorId: me, limit: 1000, now });

    expect(snapshot).toEqual({ tokensUsed24h: 500, tokensRemaining24h: 500, quotaExhausted: false });
  });

  it("reports an exhausted quota when usage reaches the limit", async () => {
    const now = new Date();
    const me = await insertVisitor({ anon_id: "me" });
    await usageAt(me, 1000, new Date(now.getTime() - HOUR));

    const snapshot = await loadQuotaSnapshot({ visitorId: me, limit: 1000, now });

    expect(snapshot).toEqual({ tokensUsed24h: 1000, tokensRemaining24h: 0, quotaExhausted: true });
  });
});
