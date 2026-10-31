import { query } from "@/lib/db";

export async function insertVisitor(fields: {
  anon_id?: string | null;
  server_cookie_id?: string | null;
  current_ip_hash?: string | null;
} = {}) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO visitor_identities (anon_id, server_cookie_id, current_ip_hash)
     VALUES ($1, $2, $3) RETURNING id`,
    [fields.anon_id ?? null, fields.server_cookie_id ?? null, fields.current_ip_hash ?? null],
  );
  return row.id;
}

export async function insertMessageAt(fields: {
  anonId: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  visitorId?: string | null;
}) {
  await query(
    `INSERT INTO chat_messages (anon_id, session_id, role, content, created_at, visitor_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [fields.anonId, fields.sessionId, fields.role, fields.content, fields.createdAt, fields.visitorId ?? null],
  );
}
