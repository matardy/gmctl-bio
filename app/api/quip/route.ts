import { generateQuip } from '@/lib/quip/quip';

export const runtime = 'nodejs';

interface QuipMessage { role: string; content: string }

export async function POST(req: Request) {
  const { section, lang, messages } = await req.json() as {
    section: string;
    lang: string;
    messages?: QuipMessage[];
  };

  const quip = await generateQuip({ section, lang, messages });
  return Response.json({ quip });
}
