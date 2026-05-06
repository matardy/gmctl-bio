import { NextRequest, NextResponse } from 'next/server';
import { computeQuotaSnapshot, createEmptyQuotaSnapshot } from '@/lib/chat/quota';
import {
  findVisitorIdentity,
  getOrCreateVisitorCookieId,
  getRequestIpHash,
} from '@/lib/chat/visitor';
import { supabase } from '@/lib/supabase';

const CHAT_TOKENS_LIMIT_24H = Number(process.env.CHAT_TOKENS_LIMIT_24H ?? '12000');

export async function GET(req: NextRequest) {
  const anonId = req.nextUrl.searchParams.get('anon_id');
  const emptySnapshot = createEmptyQuotaSnapshot(CHAT_TOKENS_LIMIT_24H);

  try {
    const cookie = await getOrCreateVisitorCookieId();
    const ipHash = await getRequestIpHash();
    const visitor = await findVisitorIdentity({
      anonId,
      cookieId: cookie.value,
      ipHash,
    });

    if (!visitor) {
      return NextResponse.json({
        tokens_used_24h: emptySnapshot.tokensUsed24h,
        tokens_limit_24h: CHAT_TOKENS_LIMIT_24H,
        tokens_remaining_24h: emptySnapshot.tokensRemaining24h,
        quota_exhausted: emptySnapshot.quotaExhausted,
        window_rolling: true,
      });
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: usageRows, error } = await supabase
      .from('chat_usage_events')
      .select('total_tokens, created_at')
      .eq('visitor_id', visitor.id)
      .gte('created_at', since);

    if (error) {
      throw error;
    }

    const snapshot = computeQuotaSnapshot({
      now: new Date(),
      limit: CHAT_TOKENS_LIMIT_24H,
      events: usageRows ?? [],
    });

    return NextResponse.json({
      tokens_used_24h: snapshot.tokensUsed24h,
      tokens_limit_24h: CHAT_TOKENS_LIMIT_24H,
      tokens_remaining_24h: snapshot.tokensRemaining24h,
      quota_exhausted: snapshot.quotaExhausted,
      window_rolling: true,
    });
  } catch {
    return NextResponse.json({
      tokens_used_24h: emptySnapshot.tokensUsed24h,
      tokens_limit_24h: CHAT_TOKENS_LIMIT_24H,
      tokens_remaining_24h: emptySnapshot.tokensRemaining24h,
      quota_exhausted: emptySnapshot.quotaExhausted,
      window_rolling: true,
    });
  }
}
