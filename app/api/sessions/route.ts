import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

interface SessionRow {
  session_id: string;
  started_at: string;
  preview: string;
  count: number;
}

export async function GET(req: NextRequest) {
  const anon_id = req.nextUrl.searchParams.get('anon_id');
  if (!anon_id) return NextResponse.json({ sessions: [] });

  const { data, error } = await supabase
    .from('chat_messages')
    .select('session_id, role, content, created_at')
    .eq('anon_id', anon_id)
    .order('created_at', { ascending: true });

  if (error || !data) return NextResponse.json({ sessions: [] });

  const sessionMap = new Map<string, SessionRow>();
  for (const msg of data) {
    if (!sessionMap.has(msg.session_id)) {
      sessionMap.set(msg.session_id, {
        session_id: msg.session_id,
        started_at: msg.created_at as string,
        preview: '',
        count: 0,
      });
    }
    const session = sessionMap.get(msg.session_id)!;
    session.count++;
    if (!session.preview && msg.role === 'user') {
      session.preview = (msg.content as string).slice(0, 80);
    }
  }

  const sessions = Array.from(sessionMap.values())
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  return NextResponse.json({ sessions });
}
