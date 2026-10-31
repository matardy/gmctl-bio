import { query } from '@/lib/db';

export interface ModerationEventInput {
  visitorId: string;
  sessionId: string;
  checkedAfterUserMessageCount: number;
  verdict: 'allow' | 'warn' | 'block' | 'error';
  reasonCode: string;
  rawLabel: string | null;
}

export async function hasBeenWarned(visitorId: string): Promise<boolean> {
  const rows = await query(
    `SELECT 1 FROM topic_moderation_events WHERE visitor_id = $1 AND verdict = 'warn' LIMIT 1`,
    [visitorId],
  );
  return rows.length > 0;
}

export async function recordModerationEvent(input: ModerationEventInput) {
  await query(
    `INSERT INTO topic_moderation_events
       (visitor_id, session_id, checked_after_user_message_count, verdict, reason_code, raw_label)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.visitorId,
      input.sessionId,
      input.checkedAfterUserMessageCount,
      input.verdict,
      input.reasonCode,
      input.rawLabel,
    ],
  );
}
