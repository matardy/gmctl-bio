import {
  getOrCreateVisitorCookieId,
  getRequestIpHash,
  resolveVisitorIdentity,
} from '@/lib/chat/visitor';
import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const HISTORY_LIMIT = 50;

export async function GET(req: NextRequest) {
  const anon_id = req.nextUrl.searchParams.get('anon_id');
  const session_id = req.nextUrl.searchParams.get('session_id');
  if (!anon_id) return NextResponse.json({ messages: [] });

  let query = supabase
    .from('chat_messages')
    .select('role, content, created_at, session_id')
    .eq('anon_id', anon_id)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (session_id) {
    query = query.eq('session_id', session_id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ messages: [] }, { status: 500 });

  return NextResponse.json({ messages: (data ?? []).reverse() });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    anon_id: string;
    session_id: string;
    role: 'user' | 'assistant';
    content: string;
  };

  const { anon_id, session_id, role, content } = body;
  if (!anon_id || !session_id || !role || !content) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }

  try {
    const cookie = await getOrCreateVisitorCookieId();
    const ipHash = await getRequestIpHash();
    const visitor = await resolveVisitorIdentity({
      anonId: anon_id,
      cookieId: cookie.value,
      ipHash,
    });
    const { error } = await supabase
      .from('chat_messages')
      .insert({ anon_id, session_id, visitor_id: visitor.id, role, content });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } catch {
    return NextResponse.json({ error: 'visitor_unavailable' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
