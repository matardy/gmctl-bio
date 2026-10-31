import { describe, expect, it } from "vitest";
import { query } from "@/lib/db";
import { insertMessageAt, insertVisitor } from "@/tests/db-fixtures";
import { findVisitorIdentity, resolveVisitorIdentity } from "./visitor";

async function visitorRows() {
  return query<{ id: string; anon_id: string | null; server_cookie_id: string | null; current_ip_hash: string | null }>(
    "SELECT id, anon_id, server_cookie_id, current_ip_hash FROM visitor_identities ORDER BY created_at",
  );
}

describe("resolveVisitorIdentity", () => {
  it("creates a visitor when nothing matches", async () => {
    const visitor = await resolveVisitorIdentity({ anonId: "anon-1", cookieId: "cookie-1", ipHash: "ip-1" });

    expect(visitor).toMatchObject({ anon_id: "anon-1", server_cookie_id: "cookie-1", current_ip_hash: "ip-1" });
    expect(await visitorRows()).toEqual([
      { id: visitor.id, anon_id: "anon-1", server_cookie_id: "cookie-1", current_ip_hash: "ip-1" },
    ]);
  });

  it("returns the same visitor for the same cookie and bumps last_seen_at", async () => {
    const first = await resolveVisitorIdentity({ anonId: "anon-1", cookieId: "cookie-1", ipHash: "ip-1" });
    await query("UPDATE visitor_identities SET last_seen_at = now() - interval '1 day'");

    const second = await resolveVisitorIdentity({ anonId: "anon-1", cookieId: "cookie-1", ipHash: "ip-1" });

    expect(second.id).toBe(first.id);
    const [{ fresh }] = await query<{ fresh: boolean }>(
      "SELECT last_seen_at > now() - interval '1 minute' AS fresh FROM visitor_identities",
    );
    expect(fresh).toBe(true);
    expect(await visitorRows()).toHaveLength(1);
  });

  it("attaches a new cookie and ip to a visitor known only by anon id", async () => {
    const anonOnly = await resolveVisitorIdentity({ anonId: "anon-1", cookieId: null, ipHash: null });

    const linked = await resolveVisitorIdentity({ anonId: "anon-1", cookieId: "cookie-9", ipHash: "ip-9" });

    expect(linked.id).toBe(anonOnly.id);
    expect(await visitorRows()).toEqual([
      { id: anonOnly.id, anon_id: "anon-1", server_cookie_id: "cookie-9", current_ip_hash: "ip-9" },
    ]);
  });

  it("merges a duplicate visitor into the cookie visitor and moves its references", async () => {
    const cookieVisitor = await insertVisitor({ server_cookie_id: "cookie-1" });
    const anonVisitor = await insertVisitor({ anon_id: "anon-1", current_ip_hash: "ip-old" });
    await insertMessageAt({
      anonId: "anon-1",
      sessionId: "s1",
      role: "user",
      content: "hola",
      createdAt: new Date(),
      visitorId: anonVisitor,
    });

    const merged = await resolveVisitorIdentity({ anonId: "anon-1", cookieId: "cookie-1", ipHash: "ip-new" });

    expect(merged.id).toBe(cookieVisitor);
    expect(await visitorRows()).toEqual([
      { id: cookieVisitor, anon_id: "anon-1", server_cookie_id: "cookie-1", current_ip_hash: "ip-new" },
    ]);
    const messages = await query<{ visitor_id: string }>("SELECT visitor_id FROM chat_messages");
    expect(messages).toEqual([{ visitor_id: cookieVisitor }]);
  });
});

describe("findVisitorIdentity", () => {
  it("returns null for an unknown visitor", async () => {
    expect(await findVisitorIdentity({ anonId: "nobody", cookieId: null, ipHash: null })).toBeNull();
  });

  it("finds a visitor by anon id without writing", async () => {
    const id = await insertVisitor({ anon_id: "anon-1" });
    const found = await findVisitorIdentity({ anonId: "anon-1", cookieId: null, ipHash: null });
    expect(found?.id).toBe(id);
  });
});
