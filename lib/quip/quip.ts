import { getChatModel } from '@/lib/agent/models';

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

export interface GenerateQuipInput {
  section: string;
  lang: string;
  messages?: { role: string; content: string }[];
}

export async function generateQuip(input: GenerateQuipInput): Promise<string> {
  const label = SECTION_LABELS[input.section] ?? { en: input.section, es: input.section };
  const contextBlock = input.messages?.length
    ? `\nRecent chat:\n${input.messages.map((m) => `${m.role}: ${m.content}`).join('\n')}\n`
    : '';

  const prompt =
    input.lang === 'es'
      ? `Eres el agente terminal sarcástico del portfolio de Gutemberg Mendoza.${contextBlock}\nEscribe UN comentario muy corto (máximo 10 palabras), gracioso e irónico mientras navega a "${label.es}". Humor terminal/hacker. Solo el comentario, sin comillas.`
      : `You're the sarcastic terminal agent in Gutemberg Mendoza's portfolio.${contextBlock}\nWrite ONE very short comment (max 10 words), funny and ironic as user navigates to "${label.en}". Terminal/hacker humor. Just the comment, no quotes.`;

  const model = getChatModel('openrouter', QUIP_MODEL);
  const res = await model.invoke(prompt);
  const text = String(res.content).trim().replace(/^["']|["']$/g, '');
  return `→ ${input.section} · ${text}`;
}
