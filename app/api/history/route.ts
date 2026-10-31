import { insertChatMessage, listHistory } from '@/lib/chat/history';
import { parseToolCalls } from '@/lib/chat/transcript';
import {
  getOrCreateVisitorCookieId,
  getRequestIpHash,
  resolveVisitorIdentity,
} from '@/lib/chat/visitor';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const anon_id = req.nextUrl.searchParams.get('anon_id');
  const session_id = req.nextUrl.searchParams.get('session_id');
  if (!anon_id) return NextResponse.json({ messages: [] });

  try {
    const messages = await listHistory({ anonId: anon_id, sessionId: session_id });
    return NextResponse.json({ messages });
  } catch (error) {
    console.error('list history', error);
    return NextResponse.json({ messages: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    anon_id: string;
    session_id: string;
    role: 'user' | 'assistant';
    content: string;
    tool_calls?: unknown;
  };

  const { anon_id, session_id, role, content } = body;
  if (!anon_id || !session_id || !role || !content) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  if (role !== 'user' && role !== 'assistant') {
    return NextResponse.json({ error: 'invalid role' }, { status: 400 });
  }
  // Only assistant turns carry generative-UI tool calls.
  const toolCalls = role === 'assistant' ? parseToolCalls(body.tool_calls) : [];
  if (toolCalls === null) {
    return NextResponse.json({ error: 'invalid tool_calls' }, { status: 400 });
  }

  let visitorId: string;
  try {
    const cookie = await getOrCreateVisitorCookieId();
    const ipHash = await getRequestIpHash();
    const visitor = await resolveVisitorIdentity({
      anonId: anon_id,
      cookieId: cookie.value,
      ipHash,
    });
    visitorId = visitor.id;
  } catch (error) {
    console.error('resolve visitor', error);
    return NextResponse.json({ error: 'visitor_unavailable' }, { status: 503 });
  }

  try {
    await insertChatMessage({ anonId: anon_id, sessionId: session_id, visitorId, role, content, toolCalls });
  } catch (error) {
    console.error('insert chat message', error);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
