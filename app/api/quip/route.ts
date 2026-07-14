import { langfuseSpanProcessor } from '@/instrumentation';
import { propagateAttributes, startObservation } from '@langfuse/tracing';
import { after } from 'next/server';
import { generateQuip } from '@/lib/quip/quip';

export const runtime = 'nodejs';

interface QuipMessage { role: string; content: string }

const postHandler = async (req: Request) => {
  const { section, lang, messages } = await req.json() as {
    section: string;
    lang: string;
    messages?: QuipMessage[];
  };

  after(async () => {
    await langfuseSpanProcessor.forceFlush();
  });

  const rootObservation = startObservation('generate-navigation-quip', {
    input: { section, lang },
    metadata: { section, lang },
  }, { asType: 'agent' });

  return propagateAttributes({
    traceName: 'navigation-quip',
    metadata: { section, lang },
    tags: ['quip', 'navigation'],
  }, async () => {
    const quip = await generateQuip({ section, lang, messages });
    rootObservation.update({ output: quip });
    rootObservation.end();
    return Response.json({ quip });
  });
};

export const POST = postHandler;
