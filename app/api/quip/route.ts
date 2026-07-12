import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { langfuseSpanProcessor } from '@/instrumentation';
import { propagateAttributes, startObservation } from '@langfuse/tracing';
import { after } from 'next/server';

export const runtime = 'nodejs';

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  headers: {
    'HTTP-Referer': 'https://gutemberg.dev',
    'X-Title': 'gmctl agent',
  },
});

const QUIP_MODEL = 'mistralai/mistral-7b-instruct';

const SECTION_LABELS: Record<string, { en: string; es: string }> = {
  home: { en: 'home / hero', es: 'inicio / hero' },
  about: { en: 'about (bio & background)', es: 'sobre él (bio y trayectoria)' },
  timeline: { en: 'work history / career timeline', es: 'historial laboral / línea de tiempo' },
  projects: { en: 'projects portfolio', es: 'portafolio de proyectos' },
  services: { en: 'services (mentorship & consulting)', es: 'servicios (mentoring y consultoría)' },
  writing: { en: 'blog / writing', es: 'blog / escritos' },
  voices: { en: 'testimonials / voices', es: 'testimoniales / voces' },
  contact: { en: 'contact info', es: 'información de contacto' },
};

interface QuipMessage { role: string; content: string }

const postHandler = async (req: Request) => {
  const { section, lang, messages } = await req.json() as {
    section: string;
    lang: string;
    messages?: QuipMessage[];
  };

  const label = SECTION_LABELS[section] ?? { en: section, es: section };

  const contextBlock = messages?.length
    ? `\nRecent chat:\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}\n`
    : '';

  const prompt = lang === 'es'
    ? `Eres el agente terminal sarcástico del portfolio de Gutemberg Mendoza.${contextBlock}\nEscribe UN comentario muy corto (máximo 10 palabras), gracioso e irónico mientras navega a "${label.es}". Humor terminal/hacker. Solo el comentario, sin comillas.`
    : `You're the sarcastic terminal agent in Gutemberg Mendoza's portfolio.${contextBlock}\nWrite ONE very short comment (max 10 words), funny and ironic as user navigates to "${label.en}". Terminal/hacker humor. Just the comment, no quotes.`;

  after(async () => {
    await langfuseSpanProcessor.forceFlush();
  });

  const rootObservation = startObservation('generate-navigation-quip', {
    input: prompt,
    metadata: {
      section,
      lang,
      model: QUIP_MODEL,
    },
  }, { asType: 'agent' });

  return propagateAttributes({
      traceName: 'navigation-quip',
      metadata: {
        section,
        lang,
        model: QUIP_MODEL,
      },
      tags: ['quip', 'navigation'],
    }, async () => {
      const { text } = await generateText({
        model: openrouter.chat(QUIP_MODEL),
        prompt,
        maxOutputTokens: 40,
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            agent: 'navigation-quip',
            section,
            lang,
          },
        },
      });

      const quip = `→ ${section} · ${text.trim().replace(/^["']|["']$/g, '')}`;
      rootObservation.update({ output: quip });
      rootObservation.end();
      return Response.json({ quip });
    });
};

export const POST = postHandler;
