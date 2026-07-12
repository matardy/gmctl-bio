import { NextRequest, NextResponse } from 'next/server';
import { createEmptyQuotaSnapshot, loadQuotaSnapshot } from '@/lib/chat/quota';
import {
  getOrCreateVisitorCookieId,
  getRequestIpHash,
  resolveVisitorIdentity,
} from '@/lib/chat/visitor';

const CHAT_TOKENS_LIMIT_24H = Number(process.env.CHAT_TOKENS_LIMIT_24H ?? '12000');

export async function GET(req: NextRequest) {
  const anonId = req.nextUrl.searchParams.get('anon_id');
  const emptySnapshot = createEmptyQuotaSnapshot(CHAT_TOKENS_LIMIT_24H);

  try {
    const cookie = await getOrCreateVisitorCookieId();
    const ipHash = await getRequestIpHash();
    const visitor = await resolveVisitorIdentity({
      anonId,
      cookieId: cookie.value,
      ipHash,
    });
    const snapshot = await loadQuotaSnapshot({
      visitorId: visitor.id,
      limit: CHAT_TOKENS_LIMIT_24H,
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
      error: 'quota_unavailable',
      tokens_limit_24h: CHAT_TOKENS_LIMIT_24H,
      window_rolling: true,
      tokens_used_24h: emptySnapshot.tokensUsed24h,
      tokens_remaining_24h: emptySnapshot.tokensRemaining24h,
      quota_exhausted: false,
    }, { status: 503 });
  }
}
