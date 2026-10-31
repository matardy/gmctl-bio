import { listSessions } from '@/lib/chat/history';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const anon_id = req.nextUrl.searchParams.get('anon_id');
  if (!anon_id) return NextResponse.json({ sessions: [] });

  try {
    return NextResponse.json({ sessions: await listSessions(anon_id) });
  } catch (error) {
    console.error('list sessions', error);
    return NextResponse.json({ sessions: [] });
  }
}
