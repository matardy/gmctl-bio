import type { BaseMessage } from '@langchain/core/messages';

const SPANISH_HINTS = new Set([
  'hola', 'gracias', 'sobre', 'proyectos', 'servicios', 'contacto', 'escritos',
  'experiencia', 'trayectoria', 'trabajo', 'quiero', 'puedes', 'puedo', 'como', 'para', 'con',
]);

const ENGLISH_HINTS = new Set([
  'hello', 'hi', 'thanks', 'about', 'projects', 'services', 'contact', 'writing',
  'experience', 'career', 'work', 'can', 'could', 'would', 'please', 'tell',
]);

export function getMessageText(message: BaseMessage): string {
  const content = message.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === 'string'
          ? part
          : part && typeof part === 'object' && 'text' in part
            ? String((part as { text: unknown }).text)
            : '',
      )
      .join(' ')
      .trim();
  }
  return '';
}

export function inferResponseLanguage(messages: BaseMessage[]): 'en' | 'es' {
  const lastUser = [...messages].reverse().find((m) => m.getType() === 'human');
  const text = lastUser ? getMessageText(lastUser).toLowerCase() : '';

  if (!text.trim()) {
    return 'en';
  }
  if (/[¿¡]|[áéíóúñ]/u.test(text)) {
    return 'es';
  }

  const tokens = text.match(/\p{L}+/gu) ?? [];
  let spanishScore = 0;
  let englishScore = 0;
  for (const token of tokens) {
    if (SPANISH_HINTS.has(token)) spanishScore += 1;
    if (ENGLISH_HINTS.has(token)) englishScore += 1;
  }

  return spanishScore > englishScore ? 'es' : 'en';
}
