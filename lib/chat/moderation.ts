import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, type UIMessage } from 'ai';
import { z } from 'zod';

export type TopicVerdict = 'on_topic' | 'off_topic' | 'error';
export type ModerationActionVerdict = 'allow' | 'warn' | 'block' | 'error';

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  headers: {
    'HTTP-Referer': 'https://gutemberg.dev',
    'X-Title': 'gmctl agent',
  },
});

const moderationSchema = z.object({
  label: z.enum(['on_topic', 'off_topic']),
  reasonCode: z.string().min(1).max(64),
});

export interface TopicModerationResult {
  verdict: TopicVerdict;
  reasonCode: string;
  rawLabel: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
}

export function shouldRunTopicModeration(userMessageCount: number, interval: number) {
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new RangeError('Invalid moderation interval');
  }

  return userMessageCount > 0 && userMessageCount % interval === 0;
}

export function getModerationAction(input: {
  verdict: TopicVerdict;
  alreadyWarned: boolean;
}): { verdict: ModerationActionVerdict; shouldCallMainModel: boolean } {
  if (input.verdict === 'on_topic') {
    return { verdict: 'allow', shouldCallMainModel: true };
  }

  if (input.verdict === 'error') {
    return { verdict: 'error', shouldCallMainModel: true };
  }

  if (input.alreadyWarned) {
    return { verdict: 'block', shouldCallMainModel: false };
  }

  return { verdict: 'warn', shouldCallMainModel: false };
}

function getMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(' ')
    .trim();
}

function inferResponseLanguage(messages: UIMessage[]) {
  const lastUserText = [...messages]
    .reverse()
    .find((message) => message.role === 'user');
  const text = lastUserText ? getMessageText(lastUserText).toLowerCase() : '';

  if (
    /[¿¡]|\b(hola|gracias|sobre|proyecto|trabajo|servicios|escritos|contacto|gutemberg|ayuda|quiero|puedes|puedo)\b/u.test(text)
  ) {
    return 'es';
  }

  return 'en';
}

export function getTopicPolicyCopy(
  verdict: Extract<ModerationActionVerdict, 'warn' | 'block'>,
  messages: UIMessage[],
) {
  const lang = inferResponseLanguage(messages);

  if (verdict === 'warn') {
    return lang === 'es'
      ? 'Puedo ayudarte con Gutemberg, su experiencia, proyectos, servicios, escritos o contacto.'
      : 'I can help with Gutemberg, his work, projects, services, writing, or contact.';
  }

  return lang === 'es'
    ? 'Eso está fuera del alcance de este chat. Pregunta por Gutemberg en su lugar.'
    : 'That is outside this chat\'s scope. Ask about Gutemberg instead.';
}

export function getQuotaExceededCopy(messages: UIMessage[]) {
  return inferResponseLanguage(messages) === 'es'
    ? 'La cuota de chat de 24 horas ya se agotó. Intenta de nuevo más tarde o usa contacto.'
    : 'The 24-hour chat quota is exhausted. Try again later or use contact.';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('moderation_timeout'));
      }, timeoutMs);

      promise.finally(() => clearTimeout(timeoutId)).catch(() => {});
    }),
  ]);
}

export async function classifyTopicConversation(input: {
  messages: UIMessage[];
  model: string;
  timeoutMs: number;
}): Promise<TopicModerationResult> {
  const transcript = input.messages
    .slice(-8)
    .map((message) => `${message.role}: ${getMessageText(message)}`)
    .filter((line) => line.trim().length > 0)
    .join('\n');

  try {
    const result = await withTimeout(
      generateObject({
        model: openrouter.chat(input.model),
        schema: moderationSchema,
        temperature: 0,
        maxOutputTokens: 80,
        prompt: [
          'Classify whether this conversation is on-topic for a personal portfolio assistant.',
          'Allowed: Gutemberg Mendoza, his profile, experience, projects, services, writing, testimonials, or contact.',
          'Allowed technical discussion only when it is clearly tied to Gutemberg work, stack, or experience.',
          'Disallowed: unrelated general chat, arbitrary assistant tasks, and unrelated support/problem-solving.',
          'Return on_topic or off_topic plus a short snake_case reasonCode.',
          '',
          transcript,
        ].join('\n'),
      }),
      input.timeoutMs,
    );

    return {
      verdict: result.object.label,
      reasonCode: result.object.reasonCode,
      rawLabel: result.object.label,
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      },
    };
  } catch {
    return {
      verdict: 'error',
      reasonCode: 'timeout_or_provider_error',
      rawLabel: null,
      usage: null,
    };
  }
}
