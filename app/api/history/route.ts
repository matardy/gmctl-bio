import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const HISTORY_LIMIT = 50;

export async function GET(req: NextRequest) {
  const anon_id = req.nextUrl.searchParams.get('anon_id');
  if (!anon_id) return NextResponse.json({ messages: [] });

  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at, session_id')
    .eq('anon_id', anon_id)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);

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

  const { error } = await supabase
    .from('chat_messages')
    .insert({ anon_id, session_id, role, content });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
