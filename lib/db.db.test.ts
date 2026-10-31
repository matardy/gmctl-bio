import { describe, expect, it } from "vitest";
import { getPool, query, withTransaction } from "./db";

describe("lib/db", () => {
  it("reuses one pool per process", () => {
    expect(getPool()).toBe(getPool());
  });

  it("query returns typed rows", async () => {
    const rows = await query<{ n: number }>("SELECT $1::int AS n", [7]);
    expect(rows).toEqual([{ n: 7 }]);
  });

  it("withTransaction commits on success", async () => {
    await withTransaction(async (client) => {
      await client.query("INSERT INTO visitor_identities (anon_id) VALUES ('tx-ok')");
    });
    const rows = await query("SELECT 1 FROM visitor_identities WHERE anon_id = 'tx-ok'");
    expect(rows).toHaveLength(1);
  });

  it("withTransaction rolls back when the callback throws", async () => {
    await expect(
      withTransaction(async (client) => {
        await client.query("INSERT INTO visitor_identities (anon_id) VALUES ('tx-fail')");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const rows = await query("SELECT 1 FROM visitor_identities WHERE anon_id = 'tx-fail'");
    expect(rows).toHaveLength(0);
  });
});
