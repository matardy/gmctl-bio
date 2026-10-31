import { describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import { insertVisitor } from "@/tests/db-fixtures";
import { hasBeenWarned, recordModerationEvent } from "./moderation-events";

const event = (visitorId: string, verdict: "allow" | "warn" | "block" | "error") => ({
  visitorId,
  sessionId: "s1",
  checkedAfterUserMessageCount: 8,
  verdict,
  reasonCode: "unrelated",
  rawLabel: "off_topic",
});

describe("moderation events", () => {
  it("records an event", async () => {
    const visitorId = await insertVisitor({ anon_id: "a" });
    await recordModerationEvent(event(visitorId, "allow"));

    const rows = await query(
      "SELECT session_id, checked_after_user_message_count, verdict, reason_code, raw_label FROM topic_moderation_events",
    );
    expect(rows).toEqual([
      { session_id: "s1", checked_after_user_message_count: 8, verdict: "allow", reason_code: "unrelated", raw_label: "off_topic" },
    ]);
  });

  it("hasBeenWarned is true only after a warn verdict for that visitor", async () => {
    const me = await insertVisitor({ anon_id: "me" });
    const other = await insertVisitor({ anon_id: "other" });
    await recordModerationEvent(event(me, "allow"));
    await recordModerationEvent(event(other, "warn"));
    expect(await hasBeenWarned(me)).toBe(false);

    await recordModerationEvent(event(me, "warn"));
    expect(await hasBeenWarned(me)).toBe(true);
  });
});
