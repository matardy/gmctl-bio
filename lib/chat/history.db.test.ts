import { describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import { insertMessageAt, insertVisitor } from "@/tests/db-fixtures";
import { insertChatMessage, listHistory, listSessions } from "./history";

const t = (minutes: number) => new Date(Date.UTC(2026, 9, 31, 10, minutes));

describe("insertChatMessage", () => {
  it("stores the message linked to the visitor", async () => {
    const visitorId = await insertVisitor({ anon_id: "anon-1" });
    await insertChatMessage({ anonId: "anon-1", sessionId: "s1", visitorId, role: "user", content: "hola" });

    const rows = await query("SELECT anon_id, session_id, visitor_id, role, content FROM chat_messages");
    expect(rows).toEqual([{ anon_id: "anon-1", session_id: "s1", visitor_id: visitorId, role: "user", content: "hola" }]);
  });

  it("stores the turn's tool calls and returns them with the history", async () => {
    const visitorId = await insertVisitor({ anon_id: "anon-1" });
    const toolCalls = [{ id: "c1", name: "navigate", args: { section: "services" } }];
    await insertChatMessage({
      anonId: "anon-1",
      sessionId: "s1",
      visitorId,
      role: "assistant",
      content: "aquí están.",
      toolCalls,
    });

    const [row] = await listHistory({ anonId: "anon-1" });
    expect(row.tool_calls).toEqual(toolCalls);
  });

  it("stores NULL (not []) when a turn made no tool calls", async () => {
    const visitorId = await insertVisitor({ anon_id: "anon-1" });
    await insertChatMessage({ anonId: "anon-1", sessionId: "s1", visitorId, role: "assistant", content: "x", toolCalls: [] });
    const [{ tool_calls }] = await query<{ tool_calls: unknown }>("SELECT tool_calls FROM chat_messages");
    expect(tool_calls).toBeNull();
  });
});

describe("listHistory", () => {
  it("returns this visitor's messages oldest-first with ISO timestamps", async () => {
    await insertMessageAt({ anonId: "anon-1", sessionId: "s1", role: "user", content: "q1", createdAt: t(1) });
    await insertMessageAt({ anonId: "anon-1", sessionId: "s1", role: "assistant", content: "a1", createdAt: t(2) });
    await insertMessageAt({ anonId: "anon-2", sessionId: "s9", role: "user", content: "other", createdAt: t(3) });

    expect(await listHistory({ anonId: "anon-1" })).toEqual([
      { role: "user", content: "q1", created_at: t(1).toISOString(), session_id: "s1", tool_calls: null },
      { role: "assistant", content: "a1", created_at: t(2).toISOString(), session_id: "s1", tool_calls: null },
    ]);
  });

  it("filters by session when one is given", async () => {
    await insertMessageAt({ anonId: "anon-1", sessionId: "s1", role: "user", content: "old", createdAt: t(1) });
    await insertMessageAt({ anonId: "anon-1", sessionId: "s2", role: "user", content: "new", createdAt: t(2) });

    const rows = await listHistory({ anonId: "anon-1", sessionId: "s2" });
    expect(rows.map((r) => r.content)).toEqual(["new"]);
  });

  it("keeps only the newest `limit` messages, still oldest-first", async () => {
    for (let i = 0; i < 5; i++) {
      await insertMessageAt({ anonId: "anon-1", sessionId: "s1", role: "user", content: `m${i}`, createdAt: t(i) });
    }
    const rows = await listHistory({ anonId: "anon-1", limit: 3 });
    expect(rows.map((r) => r.content)).toEqual(["m2", "m3", "m4"]);
  });
});

describe("listSessions", () => {
  it("summarises each session (start, count, first user line) newest-first", async () => {
    await insertMessageAt({ anonId: "anon-1", sessionId: "s1", role: "assistant", content: "hi there", createdAt: t(1) });
    await insertMessageAt({ anonId: "anon-1", sessionId: "s1", role: "user", content: "first question", createdAt: t(2) });
    await insertMessageAt({ anonId: "anon-1", sessionId: "s1", role: "user", content: "second question", createdAt: t(3) });
    await insertMessageAt({ anonId: "anon-1", sessionId: "s2", role: "user", content: "x".repeat(100), createdAt: t(10) });
    await insertMessageAt({ anonId: "anon-2", sessionId: "s3", role: "user", content: "not mine", createdAt: t(20) });

    expect(await listSessions("anon-1")).toEqual([
      { session_id: "s2", started_at: t(10).toISOString(), preview: "x".repeat(80), count: 1 },
      { session_id: "s1", started_at: t(1).toISOString(), preview: "first question", count: 3 },
    ]);
  });

  it("uses an empty preview when a session has no user message", async () => {
    await insertMessageAt({ anonId: "anon-1", sessionId: "s1", role: "assistant", content: "hi", createdAt: t(1) });
    const [session] = await listSessions("anon-1");
    expect(session.preview).toBe("");
  });
});
