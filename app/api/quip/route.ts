import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

export const runtime = 'edge';

const nvidia = createOpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY ?? '',
});

// Fastest free model for quick quips (DeepSeek V4 Flash — 284B MoE, optimised for speed)
const QUIP_MODEL = 'deepseek-ai/deepseek-v4-flash';

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

export async function POST(req: Request) {
  const { section, lang } = await req.json() as { section: string; lang: string };
  const label = SECTION_LABELS[section] ?? { en: section, es: section };

  const prompt = lang === 'es'
    ? `Escribe UN comentario muy corto (máximo 10 palabras), gracioso e irónico sobre Gutemberg Mendoza mientras el usuario navega a la sección "${label.es}" de su portfolio. Humor terminal/hacker. Solo el comentario, sin comillas.`
    : `Write ONE very short comment (max 10 words), funny and ironic about Gutemberg Mendoza as user navigates to "${label.en}" section of his portfolio. Terminal/hacker humor. Just the comment, no quotes.`;

  const { text } = await generateText({
    model: nvidia.chat(QUIP_MODEL),
    prompt,
    maxOutputTokens: 40,
  });

  return Response.json({ quip: `→ ${section} · ${text.trim().replace(/^["']|["']$/g, '')}` });
}
