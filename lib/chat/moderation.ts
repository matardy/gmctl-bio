import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, type UIMessage } from 'ai';
import { observe, updateActiveObservation } from '@langfuse/tracing';
import { z } from 'zod';

export type TopicVerdict = 'on_topic' | 'off_topic' | 'error';
export type ModerationActionVerdict = 'allow' | 'warn' | 'block' | 'error';
type ResponseLanguage = 'en' | 'es';

const SPANISH_HINTS = new Set([
  'hola',
  'gracias',
  'sobre',
  'proyectos',
  'servicios',
  'contacto',
  'escritos',
  'experiencia',
  'trayectoria',
  'trabajo',
  'quiero',
  'puedes',
  'puedo',
  'como',
  'para',
  'con',
]);

const ENGLISH_HINTS = new Set([
  'hello',
  'hi',
  'thanks',
  'about',
  'projects',
  'services',
  'contact',
  'writing',
  'experience',
  'career',
  'work',
  'can',
  'could',
  'would',
  'please',
  'tell',
]);

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
  const tokens = text.match(/\p{L}+/gu) ?? [];

  if (!text.trim()) {
    return 'en';
  }

  if (/[¿¡]|[áéíóúñ]/u.test(text)) {
    return 'es';
  }

  let spanishScore = 0;
  let englishScore = 0;

  for (const token of tokens) {
    if (SPANISH_HINTS.has(token)) {
      spanishScore += 1;
    }

    if (ENGLISH_HINTS.has(token)) {
      englishScore += 1;
    }
  }

  return spanishScore > englishScore ? 'es' : 'en';
}

function getLocalizedCopy(language: ResponseLanguage, copy: { en: string; es: string }) {
  return language === 'es' ? copy.es : copy.en;
}

export function getTopicPolicyCopy(
  verdict: Extract<ModerationActionVerdict, 'warn' | 'block'>,
  messages: UIMessage[],
) {
  const lang = inferResponseLanguage(messages);

  if (verdict === 'warn') {
    return getLocalizedCopy(lang, {
      en: 'I can help with Gutemberg, his work, projects, services, writing, or contact.',
      es: 'Puedo ayudarte con Gutemberg, su experiencia, proyectos, servicios, escritos o contacto.',
    });
  }

  return getLocalizedCopy(lang, {
    en: 'That is outside this chat\'s scope. Ask about Gutemberg instead.',
    es: 'Eso está fuera del alcance de este chat. Pregunta por Gutemberg en su lugar.',
  });
}

export function getQuotaExceededCopy(messages: UIMessage[]) {
  return getLocalizedCopy(inferResponseLanguage(messages), {
    en: 'The 24-hour chat quota is exhausted. Try again later or use contact.',
    es: 'La cuota de chat de 24 horas ya se agotó. Intenta de nuevo más tarde o usa contacto.',
  });
}

export function getBackendUnavailableCopy(messages: UIMessage[]) {
  return getLocalizedCopy(inferResponseLanguage(messages), {
    en: 'Chat is temporarily unavailable while quota checks recover. Try again shortly or use contact.',
    es: 'El chat no esta disponible mientras se recuperan las verificaciones de cuota. Intenta otra vez pronto o usa contacto.',
  });
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

const classifyTopicConversationImpl = async (input: {
  messages: UIMessage[];
  model: string;
  timeoutMs: number;
}): Promise<TopicModerationResult> => {
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
        experimental_telemetry: {
          isEnabled: true,
          metadata: {
            agent: 'topic-guard',
            model: input.model,
          },
        },
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

    const moderationResult: TopicModerationResult = {
      verdict: result.object.label,
      reasonCode: result.object.reasonCode,
      rawLabel: result.object.label,
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      },
    };

    updateActiveObservation({
      output: moderationResult,
      metadata: {
        transcriptPreview: transcript.slice(0, 500),
      },
    }, { asType: 'guardrail' });

    return moderationResult;
  } catch {
    const moderationResult: TopicModerationResult = {
      verdict: 'error',
      reasonCode: 'timeout_or_provider_error',
      rawLabel: null,
      usage: null,
    };

    updateActiveObservation({
      level: 'WARNING',
      output: moderationResult,
      statusMessage: 'topic_moderation_error',
      metadata: {
        transcriptPreview: transcript.slice(0, 500),
      },
    }, { asType: 'guardrail' });

    return moderationResult;
  }
};

export const classifyTopicConversation = observe(classifyTopicConversationImpl, {
  name: 'topic-guard',
  asType: 'guardrail',
  captureInput: false,
  captureOutput: true,
});
